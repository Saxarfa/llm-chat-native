import SwiftUI

/// Шторка выбора модели: группы «Локальные / AI Studio / Подписка», отметка у выбранной.
struct ModelPickerSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var showPhone = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Модель")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Spacer()
                if model.modelsLoading {
                    ProgressView().controlSize(.small).tint(Theme.muted)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 26)
            .padding(.bottom, 10)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    if model.models.isEmpty {
                        emptyState
                            .padding(.vertical, 24)
                    }
                    ForEach(ModelOption.Group.allCases, id: \.rawValue) { group in
                        let items = model.allModels.filter { $0.group == group }
                        // «На телефоне» видна всегда: из неё открывается окно моделей телефона.
                        if !items.isEmpty || group == .phone {
                            Text(group.title)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Theme.subtle)
                                .padding(.horizontal, 12)
                                .padding(.top, 14)
                                .padding(.bottom, 6)
                            ForEach(items) { item in
                                row(item)
                            }
                            if group == .phone {
                                managePhone
                            }
                        }
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.surface)
        .presentationCornerRadius(28)
        .preferredColorScheme(.dark)
        .task { await model.refreshModels() }
        .sheet(isPresented: $showPhone) {
            PhoneModelsSheet { id in
                Task { await model.selectModel(id) }
                showPhone = false
                dismiss()
            }
            .environment(model)
        }
        .task {
            // Режим снимков: второе окно — после того, как первое доехало.
            guard model.preview == .phoneModels else { return }
            try? await Task.sleep(nanoseconds: 700_000_000)
            showPhone = true
        }
    }

    private var managePhone: some View {
        Button {
            Haptics.tap()
            showPhone = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "iphone")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 22)
                Text(model.phone.installed.isEmpty ? "Скачать модель на телефон…" : "Модели на телефоне…")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.muted)
                Spacer(minLength: 8)
                if !model.phone.downloads.isEmpty {
                    ProgressView().controlSize(.small).tint(Theme.muted)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityIdentifier("phone.manage")
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            if model.modelsLoading {
                ProgressView().tint(Theme.muted)
            } else {
                Text("Список моделей недоступен. Проверьте, что сервер моделей на компьютере запущен.")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                Button("Повторить") {
                    Task { await model.refreshModels() }
                }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 20)
                .frame(minHeight: 44)
                .background(Theme.fill, in: Capsule())
                .buttonStyle(PressScaleStyle())
            }
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func row(_ item: ModelOption) -> some View {
        let selected = item.id == model.activeModelID
        return Button {
            Task { await model.selectModel(item.id) }
            dismiss()
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name)
                        .font(.system(size: 17, weight: selected ? .semibold : .regular))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    if item.loaded {
                        Text("Загружена в память")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.subtle)
                    }
                }
                Spacer(minLength: 8)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 52)
            .background(selected ? Theme.fillActive : Color.clear,
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
