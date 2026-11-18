import sys
sys.dont_write_bytecode = True
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
from types import SimpleNamespace as NS
import unittest

root=Path(__file__).resolve().parent
bridge_path=root.parent/'plugin/scripts/aidea_bridge.py'
spec=importlib.util.spec_from_file_location('bridge',bridge_path)
bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)

class ProgressTests(unittest.TestCase):
    def test_local_gemini_concurrency_is_bounded_and_other_providers_unchanged(self):
        for host in ['127.0.0.1:8100','localhost:8101','[::1]:8100']:
            self.assertEqual(bridge.translation_limits({'qps':10,'poolMaxWorker':8,'oauthProxy':{'apiBase':'http://'+host+'/v1/'}},'gemini-4-hydrogen'),(1,1,True))
        self.assertEqual(bridge.translation_limits({'qps':10,'poolMaxWorker':2,'oauthProxy':{'apiBase':'https://example.invalid/v1/'}},'gemini-pro'),(10,2,False))
        self.assertEqual(bridge.translation_limits({'qps':10,'poolMaxWorker':1},'deepseek-chat'),(10,1,False))
        source=(bridge_path).read_text(encoding='utf-8')
        self.assertIn('pool_max_worker >= 1',source)
        self.assertIn('--pool-max-workers',source)

    def test_structured_counts_are_items_not_pages(self):
        event={'type':'progress_update','stage':'Translate Paragraphs','overall_progress':35.5,'stage_current':12,'stage_total':40}
        data=bridge.parse_engine_progress('AIDEA_PROGRESS '+json.dumps(event))
        self.assertEqual(data['overallProgress'],35.5)
        self.assertEqual((data['unitCurrent'],data['unitTotal']),(12,40))
        self.assertNotIn('current',data)
        self.assertNotIn('total',data)
        self.assertEqual(data['stage'],'translating')

    def test_invalid_events_and_dates_are_not_progress(self):
        for line in ['[11/16/26 15:00:00] Downloading fonts 30%', 'AIDEA_PROGRESS invalid', 'AIDEA_PROGRESS null',
                     'AIDEA_PROGRESS '+json.dumps({'type':'progress_update','overall_progress':float('nan')}),
                     'AIDEA_PROGRESS '+json.dumps({'type':'progress_update','overall_progress':101})]:
            self.assertIsNone(bridge.parse_engine_progress(line))
        self.assertIsNone(bridge.parse_progress('[11/16/26 15:00:00] Starting engine'))

    def test_heartbeat_during_quiet_engine(self):
        def lines():
            time.sleep(1.15)
            yield 'AIDEA_PROGRESS example\n'
        heartbeats=[]
        result=list(bridge.iter_engine_lines(NS(stdout=lines()),lambda:heartbeats.append(time.time())))
        self.assertEqual(result,['AIDEA_PROGRESS example\n'])
        self.assertGreaterEqual(len(heartbeats),1)

    @unittest.skipUnless(os.environ.get('AIDEA_TRANSLATE_PYTHON'), 'Set AIDEA_TRANSLATE_PYTHON for installed-engine checks')
    def test_hook_uses_actual_installed_babeldoc_callbacks_without_translation(self):
        env,patch_dir=bridge._prepare_pdf2zh_runtime_env()
        patch_path=Path(patch_dir).resolve()
        self.assertEqual(patch_path.parent,Path(tempfile.gettempdir()).resolve())
        self.assertTrue(patch_path.name.startswith('aidea-pdf2zh-patch-'))
        python=Path(os.environ['AIDEA_TRANSLATE_PYTHON'])
        code="""
from types import SimpleNamespace
from babeldoc.main import create_progress_handler
from babeldoc.progress_monitor import ProgressMonitor
context,handler=create_progress_handler(SimpleNamespace(use_rich_pbar=True))
pm=ProgressMonitor([('Translate Paragraphs',1)],progress_change_callback=lambda **event:handler(event),report_interval=0)
with context:
    with pm.stage_start('Translate Paragraphs',2) as stage:
        stage.advance()
        stage.advance()
"""
        try:
            result=subprocess.run([str(python),'-c',code],env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
            self.assertEqual(result.returncode,0,result.stderr[-2000:])
            events=[bridge.parse_engine_progress(line) for line in result.stderr.splitlines() if line.startswith('AIDEA_PROGRESS ')]
            self.assertGreaterEqual(len(events),3)
            self.assertEqual(events[-1]['overallProgress'],100)
            self.assertEqual(events[-1]['unitCurrent'],2)
        finally:
            self.assertEqual(patch_path.parent,Path(tempfile.gettempdir()).resolve())
            self.assertTrue(patch_path.name.startswith('aidea-pdf2zh-patch-'))
            shutil.rmtree(patch_path)

    @unittest.skipUnless(os.environ.get('AIDEA_TRANSLATE_PYTHON'), 'Set AIDEA_TRANSLATE_PYTHON for installed-engine checks')
    def test_whole_bridge_progress_pipeline_with_offline_simulated_engine(self):
        directory=Path(tempfile.mkdtemp(prefix='aidea-progress-test-')).resolve()
        self.assertEqual(directory.parent,Path(tempfile.gettempdir()).resolve())
        self.assertTrue(directory.name.startswith('aidea-progress-test-'))
        python=Path(os.environ['AIDEA_TRANSLATE_PYTHON'])
        samples=[];stop=threading.Event();reader=None
        try:
            engine=directory/'fake_engine.py'
            engine.write_text('''import json,sys,time
from pathlib import Path
import fitz
assert sys.argv[sys.argv.index('--pool-max-workers')+1]=='1'
def report(kind,current,pct):
 print('AIDEA_PROGRESS '+json.dumps(dict(type=kind,stage='Translate Paragraphs',overall_progress=pct,stage_current=current,stage_total=2)),flush=True)
report('progress_start',0,0)
time.sleep(1.1)
report('progress_update',1,50)
time.sleep(1.1)
report('progress_end',2,100)
out=Path(sys.argv[sys.argv.index('--output')+1]);out.mkdir(exist_ok=True)
doc=fitz.open();page=doc.new_page();page.insert_text((50,50),'Offline engine fixture');doc.save(out/'fake_engine.zh-CN.mono.pdf');doc.close()
''',encoding='utf-8')
            config=directory/'config.toml';config.write_text('',encoding='utf-8')
            progress=directory/'progress.json'
            task={'pdf2zhBin':str(python),'pdfPath':str(engine),'outputDir':str(directory/'output'),'configFile':str(config),'progressFile':str(progress),'poolMaxWorker':1}
            task_file=directory/'task.json';task_file.write_text(json.dumps(task),encoding='utf-8')
            def observe():
                while not stop.wait(.05):
                    try:samples.append(json.loads(progress.read_text(encoding='utf-8')))
                    except (OSError,ValueError):pass
            reader=threading.Thread(target=observe,daemon=True);reader.start()
            result=subprocess.run([str(python),str(bridge_path),str(task_file)],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=70)
            self.assertEqual(result.returncode,0,result.stderr[-2000:]+result.stdout[-1500:])
            final=json.loads(progress.read_text(encoding='utf-8'))
            self.assertEqual(final['status'],'done')
            self.assertEqual(final['progress'],100)
            self.assertTrue(any(row.get('unitCurrent')==1 and row['progress']>10 for row in samples))
            self.assertTrue(final.get('outputFiles'))
        finally:
            stop.set()
            if reader:reader.join(timeout=2)
            self.assertEqual(directory.parent,Path(tempfile.gettempdir()).resolve())
            self.assertTrue(directory.name.startswith('aidea-progress-test-'))
            shutil.rmtree(directory)

if __name__=='__main__':unittest.main(verbosity=2)
