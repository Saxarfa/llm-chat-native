import SwiftUI

/// Ветки диалога — как `BranchSwitcher.tsx`: выбрать ветку или удалить ненужную.
struct BranchesSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var deleting: ChatBranch?

    var body: some View {
        let branches = model.activeBranches
        let active = model.activeBranchID
        VStack(spacing: 0) {
            SheetHeader(title: "Ветки диалога", subtitle: branchCount(branches.count), busy: model.branchBusy)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if !model.canChangeHistory, !model.branchBusy {
                        SettingsNote(text: "Переключение доступно после завершения ответа.")
                    }
                    SettingsCard {
                        ForEach(Array(branches.enumerated()), id: \.element.id) { index, branch in
                            if index > 0 { CardDivider() }
                            row(branch, branches: branches, isActive: branch.id == active)
                        }
                    }
                    SettingsNote(text: "Новая ветка появляется, когда вы меняете своё сообщение или выбираете «Новая ветка отсюда». Прежнее продолжение сохраняется в старой ветке.")
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
        .confirmationDialog("Удалить ветку «\(deleting?.name ?? "")»?",
                            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button("Удалить", role: .destructive) {
                if let branch = deleting {
                    Task { await model.deleteBranch(branch.id) }
                }
                deleting = nil
            }
            Button("Отмена", role: .cancel) { deleting = nil }
        } message: {
            Text("Сообщения этой ветки будут удалены. Другие ветки, включая дочерние, сохранятся.")
        }
        .onChange(of: branches.count) { _, count in
            if count < 2 { dismiss() }
        }
    }

    private func row(_ branch: ChatBranch, branches: [ChatBranch], isActive: Bool) -> some View {
        let parent = branch.parentID.flatMap { id in branches.first { $0.id == id }?.name }
        var details = "\(branch.messageCount) сообщ."
        if branch.parentID != nil { details = "Из «\(parent ?? "Основная")» · " + details }
        return HStack(spacing: 4) {
            Button {
                guard !isActive else { return }
                Task {
                    await model.switchBranch(branch.id)
                    if model.activeBranchID == branch.id { dismiss() }
                }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "arrow.triangle.branch")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(isActive ? Theme.ink : Theme.muted)
                        .frame(width: 22)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(branch.name)
                            .font(.system(size: 16, weight: isActive ? .semibold : .regular))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Text(details)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.subtle)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if isActive {
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                    }
                }
                .padding(.leading, 16)
                .frame(minHeight: 60)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowPressStyle())
            .disabled(!model.canChangeHistory && !isActive)
            .accessibilityAddTraits(isActive ? .isSelected : [])

            Button {
                Haptics.tap()
                deleting = branch
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 48, height: 48)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .disabled(!model.canChangeHistory)
            .accessibilityLabel("Удалить ветку «\(branch.name)»")
            .padding(.trailing, 4)
        }
    }

    private func branchCount(_ count: Int) -> String {
        let forms = ["ветка", "ветки", "веток"]
        let tail = count % 100
        let form = (11...14).contains(tail) ? forms[2] : count % 10 == 1 ? forms[0] : (2...4).contains(count % 10) ? forms[1] : forms[2]
        return "\(count) \(form)"
    }
}
