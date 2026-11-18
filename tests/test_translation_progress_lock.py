import sys
sys.dont_write_bytecode = True
from contextlib import contextmanager, redirect_stderr
import ctypes
from ctypes import wintypes
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import unittest

root=Path(__file__).resolve().parent
bridge_path=root.parent/'plugin/scripts/aidea_bridge.py'
spec=importlib.util.spec_from_file_location('bridge',bridge_path)
bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)


@unittest.skipUnless(os.name == 'nt', 'Native Windows file-sharing test')
class WriterTests(unittest.TestCase):
    def setUp(self):
        self.directory=Path(tempfile.mkdtemp(prefix='aidea-progress-lock-test-')).resolve()
        self.assertEqual(self.directory.parent,Path(tempfile.gettempdir()).resolve())
        self.path=self.directory/'progress.json'
        self.path.write_text('{"status":"running","progress":10}',encoding='utf-8')

    def tearDown(self):
        self.assertEqual(self.directory.parent,Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.directory.name.startswith('aidea-progress-lock-test-'))
        shutil.rmtree(self.directory)

    @contextmanager
    def reader_without_share_delete(self):
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.CreateFileW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]
        kernel.CreateFileW.restype=wintypes.HANDLE
        kernel.CloseHandle.argtypes=[wintypes.HANDLE];kernel.CloseHandle.restype=wintypes.BOOL
        handle=kernel.CreateFileW(str(self.path),0x80000000,0x1|0x2,None,3,0x80,None)
        self.assertNotEqual(handle,ctypes.c_void_p(-1).value)
        lock=threading.Lock()
        def release():
            nonlocal handle
            with lock:
                if handle is not None:
                    kernel.CloseHandle(handle);handle=None
        try:yield release
        finally:release()

    def test_running_snapshot_lock_never_raises_and_next_frame_recovers(self):
        with self.reader_without_share_delete(),redirect_stderr(io.StringIO()):
            result=bridge.write_progress(str(self.path),{'status':'running','progress':30})
        self.assertFalse(result)
        self.assertEqual(json.loads(self.path.read_text())['progress'],10)
        self.assertTrue(bridge.write_progress(str(self.path),{'status':'running','progress':40}))
        self.assertEqual(json.loads(self.path.read_text())['progress'],40)
        self.assertEqual(list(self.directory.glob('*.tmp')),[])

    def test_short_reader_lock_is_retried_successfully(self):
        with self.reader_without_share_delete() as release:
            timer=threading.Timer(.05,release);timer.start()
            try:self.assertTrue(bridge.write_progress(str(self.path),{'status':'running','progress':50}))
            finally:timer.join()
        self.assertEqual(json.loads(self.path.read_text())['progress'],50)

    def test_terminal_result_survives_a_locked_primary_file(self):
        for status in ['done','error']:
            with self.reader_without_share_delete():
                self.assertTrue(bridge.write_progress(str(self.path),{'status':status,'progress':100,'message':'测试结果'}))
            final=Path(str(self.path)+'.final.json')
            self.assertEqual(json.loads(final.read_text(encoding='utf-8'))['status'],status)
            self.assertEqual(json.loads(final.read_text(encoding='utf-8'))['message'],'测试结果')

if __name__=='__main__':unittest.main(verbosity=2)
