import QtQuick
import QtQuick.Controls
// Like PulsarView, which gets its ToolButton from the Material style.
import QtQuick.Controls.Material

ToolButton {
    id: iconRoot

    required property Window view
    property var pulsarMeta: null
    property color iconColor: view.themeText

    implicitWidth: 40
    implicitHeight: 40
    palette.buttonText: iconColor
    palette.windowText: iconColor
    palette.text: iconColor

    Binding {
        target: iconRoot.contentItem
        property: "color"
        value: iconRoot.iconColor
        when: iconRoot.contentItem !== null && iconRoot.contentItem.color !== undefined
    }
}
