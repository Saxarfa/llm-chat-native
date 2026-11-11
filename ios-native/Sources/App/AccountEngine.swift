import Foundation

/// Память и базы знаний аккаунта — те же запросы, что у сайта
/// (`MemorySettings.tsx`, `KnowledgeSettings.tsx`). Ошибки бросаются: их показывает окно.
extension AppModel {
    // MARK: - Память

    func memory() async throws -> MemorySnapshot {
        if preview != nil { return PreviewScene.memorySample }
        guard let api else { throw APIError.unreachable }
        return MemorySnapshot(json: try await api.json("/api/memory"))
    }

    func saveMemorySettings(enabled: Bool, autoSave: Bool, version: Int) async throws -> MemorySnapshot {
        guard let api else { throw APIError.unreachable }
        let json = try await api.json("/api/memory/settings", method: "PUT",
                                      body: ["enabled": enabled, "auto_save": autoSave, "version": version])
        return MemorySnapshot(json: json)
    }

    func addMemory(_ text: String) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/memory", method: "POST", body: ["text": text, "scope": ""])
    }

    func updateMemory(_ fact: MemoryFact, text: String) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/memory/\(APIClient.pathSafe(fact.id))", method: "PUT",
                               body: ["text": text, "scope": fact.scope, "version": fact.version])
    }

    func deleteMemory(_ fact: MemoryFact) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/memory/\(APIClient.pathSafe(fact.id))?version=\(fact.version)", method: "DELETE")
    }

    // MARK: - Базы знаний

    /// Обновляет `knowledgeLibraries`; `false` — не удалось (список остаётся прежним).
    @discardableResult
    func loadLibraries() async -> Bool {
        if preview != nil {
            knowledgeLibraries = PreviewScene.libraries
            return true
        }
        guard let api, let json = try? await api.json("/api/knowledge/libraries") else { return false }
        knowledgeLibraries = ((json["libraries"] as? [[String: Any]]) ?? []).compactMap(KnowledgeLibrary.init(json:))
        return true
    }

    func createLibrary(_ name: String) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/knowledge/libraries", method: "POST", body: ["name": name, "description": ""])
        await loadLibraries()
    }

    func renameLibrary(_ library: KnowledgeLibrary, to name: String) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/knowledge/libraries/\(APIClient.pathSafe(library.id))", method: "PUT",
                               body: ["name": name, "description": library.description, "version": library.version])
        await loadLibraries()
    }

    func deleteLibrary(_ library: KnowledgeLibrary) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/knowledge/libraries/\(APIClient.pathSafe(library.id))?version=\(library.version)",
                               method: "DELETE")
        await loadLibraries()
    }

    func documents(in library: KnowledgeLibrary) async throws -> [KnowledgeDocument] {
        if preview != nil { return PreviewScene.documents }
        guard let api else { throw APIError.unreachable }
        let json = try await api.json("/api/knowledge/libraries/\(APIClient.pathSafe(library.id))/documents")
        return ((json["documents"] as? [[String: Any]]) ?? []).compactMap(KnowledgeDocument.init(json:))
    }

    /// Загружает файл из «Файлов» (PDF, DOCX, TXT, Markdown, до 20 МБ). `true` — такой файл уже был в базе.
    func uploadDocument(_ url: URL, to library: KnowledgeLibrary) async throws -> Bool {
        guard let api else { throw APIError.unreachable }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let name = url.lastPathComponent
        guard ["pdf", "docx", "txt", "md", "markdown"].contains(url.pathExtension.lowercased()) else {
            throw APIError(status: 0, message: "Выберите PDF, DOCX, TXT или Markdown.")
        }
        let data = try await Task.detached(priority: .userInitiated) { try Data(contentsOf: url) }.value
        guard data.count <= 20 * 1024 * 1024 else { throw APIError(status: 0, message: "Максимум 20 МБ на файл.") }
        let path = "/api/knowledge/libraries/\(APIClient.pathSafe(library.id))/upload?filename=\(APIClient.pathSafe(name))"
        let answer = try await api.upload(path, data: data, contentType: "application/octet-stream")
        await loadLibraries()
        return (answer["duplicate"] as? Bool) == true
    }

    func addNote(title: String, text: String, to library: KnowledgeLibrary) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/knowledge/libraries/\(APIClient.pathSafe(library.id))/notes", method: "POST",
                               body: ["title": title, "text": text])
        await loadLibraries()
    }

    func deleteDocument(_ document: KnowledgeDocument) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/knowledge/documents/\(APIClient.pathSafe(document.id))?version=\(document.version)",
                               method: "DELETE")
        await loadLibraries()
    }

    func retryDocument(_ document: KnowledgeDocument) async throws {
        guard let api else { throw APIError.unreachable }
        _ = try await api.json("/api/knowledge/documents/\(APIClient.pathSafe(document.id))/retry", method: "POST")
    }

    // MARK: - Базы знаний в чате

    var activeKnowledge: KnowledgeSelection {
        KnowledgeSelection(activeOverrides["knowledge"])
    }

    func saveKnowledge(_ selection: KnowledgeSelection) async {
        var all = activeOverrides
        all["knowledge"] = selection.json
        await saveOverrides(all)
    }
}
