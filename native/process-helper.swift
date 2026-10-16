import Foundation
import Darwin

struct Identity: Codable {
    let pid: Int32
    let path: String
    let startedAt: Int64
}
struct ProcessRecord: Codable {
    let pid: Int32
    let parentPid: UInt32
    let name: String
    let path: String
    let startedAt: Int64
}
func canonical(_ path: String) -> String {
    if let resolved = path.withCString({ Darwin.realpath($0, nil) }) {
        defer { free(resolved) }; return String(cString: resolved)
    }
    return (path as NSString).standardizingPath
}
func record(_ pid: Int32) -> ProcessRecord? {
    var info = proc_bsdinfo()
    let size = Int32(MemoryLayout<proc_bsdinfo>.size)
    guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, size) == size,
          info.pbi_uid == geteuid() else { return nil }
    // PROC_PIDPATHINFO_MAXSIZE is a C expression macro unavailable to Swift.
    var bytes = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
    let length = bytes.withUnsafeMutableBytes { proc_pidpath(pid, $0.baseAddress, UInt32($0.count)) }
    guard length > 0 else { return nil }
    let executable = canonical(String(cString: bytes))
    var name = URL(fileURLWithPath: executable).lastPathComponent
    if let range = executable.range(of: ".app/Contents/MacOS/") {
        let bundlePath = String(executable[..<range.lowerBound]) + ".app"
        if let bundle = Bundle(path: bundlePath), bundle.executableURL.map({ canonical($0.path) }) == executable {
            name = (bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
                ?? (bundle.object(forInfoDictionaryKey: "CFBundleName") as? String)
                ?? URL(fileURLWithPath: bundlePath).deletingPathExtension().lastPathComponent
        }
    }
    return ProcessRecord(pid: pid, parentPid: info.pbi_ppid, name: name, path: executable,
                         startedAt: Int64(info.pbi_start_tvsec) * 1000 + Int64(info.pbi_start_tvusec) / 1000)
}
func protected(_ target: String, own: String) -> Bool {
    let selfPath = canonical(own)
    let ownRoot: String
    if let range = selfPath.range(of: ".app/") { ownRoot = String(selfPath[..<range.lowerBound]) + ".app" }
    else { ownRoot = selfPath }
    return ["/System", "/usr", "/bin", "/sbin", "/Library/Apple", ownRoot].contains {
        target == $0 || target.hasPrefix($0 + "/")
    }
}
func output<T: Encodable>(_ value: T) throws {
    let data = try JSONEncoder().encode(value)
    FileHandle.standardOutput.write(data)
}
do {
    let args = CommandLine.arguments
    switch args.count > 1 ? args[1] : "" {
    case "capture":
        let capacity = max(1024, Int(proc_listallpids(nil, 0)) + 1024)
        var pids = [Int32](repeating: 0, count: capacity)
        let count = pids.withUnsafeMutableBytes { proc_listallpids($0.baseAddress, Int32($0.count)) }
        guard count > 0 else { throw NSError(domain: "Cannot enumerate processes", code: Int(errno)) }
        try output(pids.prefix(Int(count)).compactMap { record($0) })
    case "resolve":
        guard args.count == 3, args[2].hasSuffix(".app"),
              let bundle = Bundle(path: canonical(args[2])), let executable = bundle.executableURL,
              FileManager.default.isExecutableFile(atPath: executable.path) else {
            throw NSError(domain: "请选择有效的 .app 应用", code: 1)
        }
        let name = (bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
            ?? (bundle.object(forInfoDictionaryKey: "CFBundleName") as? String)
            ?? URL(fileURLWithPath: args[2]).deletingPathExtension().lastPathComponent
        try output(["path": canonical(executable.path), "name": name])
    case "terminate":
        guard args.count == 4 else { throw NSError(domain: "Invalid arguments", code: 1) }
        let targets = try JSONDecoder().decode([Identity].self, from: Data(args[2].utf8))
        var errors: [String] = []
        for target in targets.sorted(by: { $0.startedAt > $1.startedAt }) {
            guard target.pid > 1 else { continue }
            if protected(canonical(target.path), own: args[3]) {
                errors.append("系统程序或Pactime自身受保护：\(target.path)"); continue
            }
            guard let current = record(target.pid), current.path == target.path,
                  current.startedAt == target.startedAt else { continue }
            if kill(target.pid, SIGKILL) != 0 && errno != ESRCH {
                errors.append("无法关闭 \(current.name)：\(String(cString: strerror(errno)))")
            }
        }
        try output(errors)
    default: throw NSError(domain: "Unknown command", code: 1)
    }
} catch {
    FileHandle.standardError.write(Data(("\(error)\n").utf8)); exit(1)
}
