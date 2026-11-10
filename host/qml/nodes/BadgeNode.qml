import QtQuick
import QtQuick.Controls

Rectangle {
    id: badgeRoot

    required property Window view
    property var pulsarMeta: null
    property string label: ""
    property bool dot: false
    property color badgeColor: view.themePrimary
    property color badgeTextColor: view.themeOnPrimary

    implicitHeight: dot ? 8 : 18
    implicitWidth: dot ? 8 : Math.max(18, badgeLabel.implicitWidth + 10)
    height: implicitHeight
    width: implicitWidth
    radius: height / 2
    color: badgeColor

    Label {
        id: badgeLabel

        anchors.centerIn: parent
        text: badgeRoot.dot ? "" : badgeRoot.label
        visible: !badgeRoot.dot
        color: badgeRoot.badgeTextColor
        font.family: view.fontFamily
        font.pixelSize: view.fs(10)
        font.weight: 600
    }
}
