import SwiftUI

/// Шторка «Выбор модели», как в приложении Claude: группы карточками, у модели — описание,
/// у выбранной — синяя галочка.
struct ModelPickerSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var showPhone = false

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Text("Выбор модели")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                HStack {
                    CircleIconButton(symbol: "xmark", label: "Закрыть") { dismiss() }
                    Spacer()
                    if model.modelsLoading {
                        ProgressView().controlSize(.small).tint(Theme.muted)
                            .padding(.trailing, 12)
                    }
                }
            }
            .padding(.horizontal, 15)
            .padding(.top, 14)
            .padding(.bottom, 6)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 6) {
                    if model.models.isEmpty {
                        emptyState
                            .padding(.vertical, 24)
                    }
                    ForEach(ModelOption.Group.allCases, id: \.rawValue) { group in
                        let items = model.allModels.filter { $0.group == group }
                        // «На телефоне» видна всегда: из неё открывается окно моделей телефона.
                        if !items.isEmpty || group == .phone {
                            Text(group.title)
                                .font(.system(size: 12.5))
                                .foregroundStyle(Theme.subtle)
                                .padding(.horizontal, 18)
                                .padding(.top, 12)
                            SettingsCard {
                                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                                    if index > 0 { CardDivider() }
                                    row(item)
                                }
                                if group == .phone {
                                    if !items.isEmpty { CardDivider() }
                                    managePhone
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.sheet)
        .presentationCornerRadius(28)
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
            guard model.preview == .phoneModels || model.preview == .phoneSettings else { return }
            try? await Task.sleep(nanoseconds: 700_000_000)
            showPhone = true
        }
    }

    private var managePhone: some View {
        Button {
            Haptics.tap()
            showPhone = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "iphone")
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(Theme.ink.opacity(0.9))
                    .frame(width: 22)
                Text(model.phone.installed.isEmpty ? "Скачать модель на телефон" : "Модели на телефоне")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                if !model.phone.downloads.isEmpty {
                    ProgressView().controlSize(.small).tint(Theme.muted)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.subtle)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 46)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
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

    /// Описание под названием: из профиля модели на сайте, иначе — где она работает.
    private func detail(_ item: ModelOption) -> String {
        if let tagline = ChatConfig.text(ChatConfig.dict(model.settings.modelProfiles[item.id])["tagline"]),
           !tagline.trimmingCharacters(in: .whitespaces).isEmpty {
            return tagline
        }
        switch item.group {
        case .local: return item.loaded ? "На компьютере · загружена в память" : "На компьютере"
        case .phone: return "Работает на iPhone без компьютера"
        case .studio: return ChatParameters.isNano(item.id) ? "AI Studio · создаёт изображения" : "AI Studio"
        }
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
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Text(detail(item))
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.subtle)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.accent)
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
