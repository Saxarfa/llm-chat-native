import SwiftUI

/// «Память» — факты о пользователе, которые модель видит во всех чатах (`user_memory.py`).
struct MemorySheet: View {
    @Environment(AppModel.self) private var model
    @State private var snapshot: MemorySnapshot?
    @State private var failure: String?
    @State private var notice: String?
    @State private var busy = false
    @State private var draft = ""
    @State private var editing: MemoryFact?
    @State private var editText = ""
    @State private var deleting: MemoryFact?
    @FocusState private var typing: Bool

    var body: some View {
        VStack(spacing: 0) {
            SheetHeader(title: "Память", subtitle: snapshot.map { factCount($0.facts.count) }, busy: busy)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let snapshot {
                        content(snapshot)
                    } else if let failure {
                        SettingsNote(text: failure, symbol: "exclamationmark.circle")
                        retryButton
                    } else {
                        ProgressView()
                            .tint(Theme.muted)
                            .frame(maxWidth: .infinity, minHeight: 120)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.surface)
        .presentationCornerRadius(28)
        .preferredColorScheme(.dark)
        .task(id: model.memoryRevision) { await load() }
        .alert("Изменить факт", isPresented: Binding(get: { editing != nil }, set: { if !$0 { editing = nil } })) {
            TextField("Факт", text: $editText, axis: .vertical)
            Button("Сохранить") {
                if let fact = editing { Task { await save(fact) } }
                editing = nil
            }
            Button("Отмена", role: .cancel) { editing = nil }
        }
        .confirmationDialog("Удалить факт?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button("Удалить", role: .destructive) {
                if let fact = deleting { Task { await remove(fact) } }
                deleting = nil
            }
            Button("Отмена", role: .cancel) { deleting = nil }
        } message: {
            Text(deleting?.text ?? "")
        }
        .alert("Не получилось", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("Понятно", role: .cancel) { notice = nil }
        } message: {
            Text(notice ?? "")
        }
    }

    @ViewBuilder
    private func content(_ snapshot: MemorySnapshot) -> some View {
        SettingsCard {
            ToggleRow(title: "Память включена", hint: "Модель видит сохранённые факты в каждом чате",
                      isOn: snapshot.enabled) { value in
                Task { await saveSettings(enabled: value, autoSave: snapshot.autoSave) }
            }
            CardDivider()
            ToggleRow(title: "Запоминать автоматически",
                      hint: "Модель сама сохраняет устойчивые факты о вас. Иначе — только по просьбе «запомни»",
                      isOn: snapshot.autoSave) { value in
                Task { await saveSettings(enabled: snapshot.enabled, autoSave: value) }
            }
            .disabled(!snapshot.enabled)
            .opacity(snapshot.enabled ? 1 : 0.5)
        }

        SectionCaption(text: "Добавить")
        SettingsCard {
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Например: живу в Казани", text: $draft, axis: .vertical)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1...4)
                    .focused($typing)
                    .padding(.vertical, 14)
                Button {
                    Task { await add() }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(canAdd ? Theme.buttonPrimaryText : Theme.subtle)
                        .frame(width: 36, height: 36)
                        .background(canAdd ? Theme.buttonPrimary : Theme.fillActive, in: Circle())
                        .frame(width: 44, height: 50)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
                .disabled(!canAdd)
                .accessibilityLabel("Добавить факт")
            }
            .padding(.leading, 16)
            .padding(.trailing, 6)
        }

        SectionCaption(text: "Сохранённое")
        if snapshot.facts.isEmpty {
            SettingsNote(text: "Пока пусто. Скажите модели «запомни, что…» или добавьте факт здесь.")
        } else {
            SettingsCard {
                ForEach(Array(snapshot.facts.enumerated()), id: \.element.id) { index, fact in
                    if index > 0 { CardDivider() }
                    row(fact)
                }
            }
        }
        if !snapshot.enabled {
            SettingsNote(text: "Память выключена: факты сохранены, но модель их не видит.")
        }
    }

    private var canAdd: Bool {
        !busy && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func row(_ fact: MemoryFact) -> some View {
        HStack(alignment: .top, spacing: 4) {
            VStack(alignment: .leading, spacing: 4) {
                Text(fact.text)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                let tags = [fact.scope.isEmpty ? nil : "Только в чатах пресета",
                            fact.origin == "model" ? "Запомнила модель" : nil].compactMap { $0 }
                if !tags.isEmpty {
                    Text(tags.joined(separator: " · "))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.subtle)
                }
            }
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            Menu {
                Button {
                    editText = fact.text
                    editing = fact
                } label: {
                    Label("Изменить", systemImage: "pencil")
                }
                Button(role: .destructive) {
                    deleting = fact
                } label: {
                    Label("Удалить", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 44, height: 48)
                    .contentShape(Rectangle())
            }
            .disabled(busy)
            .accessibilityLabel("Действия с фактом")
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
    }

    private var retryButton: some View {
        Button("Повторить") {
            Task { await load() }
        }
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 20)
        .frame(minHeight: 44)
        .background(Theme.fill, in: Capsule())
        .buttonStyle(PressScaleStyle())
    }

    private func factCount(_ count: Int) -> String {
        let tail = count % 100
        let form = (11...14).contains(tail) ? "фактов" : count % 10 == 1 ? "факт" : (2...4).contains(count % 10) ? "факта" : "фактов"
        return "\(count) \(form)"
    }

    // MARK: - Запросы

    private func load() async {
        do {
            snapshot = try await model.memory()
            failure = nil
        } catch is CancellationError {
        } catch {
            if snapshot == nil { failure = (error as? APIError)?.message ?? "Не удалось загрузить память." }
        }
    }

    private func run(_ work: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do {
            try await work()
            Haptics.success()
        } catch {
            Haptics.error()
            notice = (error as? APIError)?.message ?? "Не удалось сохранить."
        }
        await load()
    }

    private func saveSettings(enabled: Bool, autoSave: Bool) async {
        guard let current = snapshot else { return }
        snapshot?.enabled = enabled
        snapshot?.autoSave = autoSave
        await run {
            snapshot = try await model.saveMemorySettings(enabled: enabled, autoSave: autoSave, version: current.version)
        }
    }

    private func add() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        await run {
            try await model.addMemory(String(text.prefix(500)))
            draft = ""
            typing = false
        }
    }

    private func save(_ fact: MemoryFact) async {
        let text = editText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != fact.text else { return }
        await run { try await model.updateMemory(fact, text: String(text.prefix(500))) }
    }

    private func remove(_ fact: MemoryFact) async {
        await run { try await model.deleteMemory(fact) }
    }
}
