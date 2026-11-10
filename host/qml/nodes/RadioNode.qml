import QtQuick
import QtQuick.Controls

RadioButton {
    id: radioRoot

    required property Window view
    property var pulsarMeta: null
    property var nodeData: null
    property color accent: view.themePrimary

    autoExclusive: false
    spacing: 10
    leftPadding: 0
    rightPadding: 0
    topPadding: 4
    bottomPadding: 4
    font.family: view.fontFamily
    font.pixelSize: view.fs(15)

    indicator: Item {
        implicitWidth: 22
        implicitHeight: 22

        Rectangle {
            anchors.fill: parent
            radius: width / 2
            color: "transparent"
            border.width: radioRoot.checked ? 0 : 1.5
            border.color: radioRoot.checked ? radioRoot.accent
                    : radioRoot.hovered ? radioRoot.accent : view.themeBorder

            Behavior on border.color {
                ColorAnimation { duration: view.motionFast }
            }
        }

        Rectangle {
            anchors.centerIn: parent
            width: radioRoot.checked ? 14 : 0
            height: width
            radius: width / 2
            color: radioRoot.accent

            Behavior on width {
                NumberAnimation {
                    duration: view.motionFast
                    easing.type: Easing.OutCubic
                }
            }
        }
    }

    contentItem: Label {
        text: radioRoot.text
        color: radioRoot.enabled ? view.themeText : view.themeTextSecondary
        font: radioRoot.font
        verticalAlignment: Text.AlignVCenter
        leftPadding: radioRoot.indicator.width + radioRoot.spacing
    }
}
