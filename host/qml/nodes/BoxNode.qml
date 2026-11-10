import QtQuick
import QtQuick.Effects

Rectangle {
    id: boxShadowHost

    required property Window view
    property int pulsarColorMs: 0

    Behavior on color {
        enabled: boxShadowHost.pulsarColorMs > 0

        ColorAnimation { duration: boxShadowHost.pulsarColorMs }
    }

    Behavior on border.color {
        enabled: boxShadowHost.pulsarColorMs > 0

        ColorAnimation { duration: boxShadowHost.pulsarColorMs }
    }

    property var pulsarMeta: null
    property int pulsarElevation: 0
    property color pulsarShadowColor: "#000000"
    layer.enabled: view.effectsAvailable && boxShadowHost.pulsarElevation > 0
    layer.effect: MultiEffect {
        shadowEnabled: true
        autoPaddingEnabled: true
        shadowColor: boxShadowHost.pulsarShadowColor
        shadowBlur: Math.min(1, 0.2 + boxShadowHost.pulsarElevation * 0.15)
        shadowOpacity: Math.min(0.5, 0.12 + boxShadowHost.pulsarElevation * 0.04)
        shadowVerticalOffset: boxShadowHost.pulsarElevation * 2
    }
}
