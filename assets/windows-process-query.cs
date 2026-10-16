using System;
using System.Runtime.InteropServices;
using System.Text;
namespace Pactime {
    public sealed class ProcessIdentity {
        public string Path = "";
        public long StartedAt;
        public int ErrorCode;
    }
    public static class ProcessReader {
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder path, ref uint size);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
        [DllImport("kernel32.dll")]
        static extern bool CloseHandle(IntPtr handle);
        public static ProcessIdentity Read(int pid) {
            var result = new ProcessIdentity();
            if (pid <= 4) return result;
            // Limited query rights suffice for path and creation time. Never request VM_READ.
            var handle = OpenProcess(0x1000, false, pid);
            if (handle == IntPtr.Zero) { result.ErrorCode = Marshal.GetLastWin32Error(); return result; }
            try {
                uint size = 32768;
                var path = new StringBuilder((int)size);
                long created, exited, kernel, user;
                if (!QueryFullProcessImageName(handle, 0, path, ref size) || !GetProcessTimes(handle, out created, out exited, out kernel, out user)) {
                    result.ErrorCode = Marshal.GetLastWin32Error(); return result;
                }
                result.Path = path.ToString();
                result.StartedAt = created / 10000L - 11644473600000L;
                return result;
            } finally { CloseHandle(handle); }
        }
    }
}
