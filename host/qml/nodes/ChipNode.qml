import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: chipRoot

    required property Window view

    implicitHeight: 32
    implicitWidth: chipLabel.implicitWidth + (chipRemove.visible ? chipRemove.implicitWidth + 18 : 24)
    property var pulsarMeta: null
    property var nodeData: null
    property alias labelItem: chipLabel
    property alias removeButton: chipRemove
    property alias contentRow: chipRow

    radius: view.themeRadius
    color: view.themeSurfaceVariant

    Behavior on color {
        ColorAnimation {
            duration: view.motionFast
            easing.type: Easing.BezierSpline
            easing.bezierCurve: view.motionCurve
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: chipRoot.radius
        color: view.withAlpha(view.themeText, 0.06)
        visible: chipMouse.containsMouse
    }

    MouseArea {
        id: chipMouse

        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: view.emitNodeEvent(chipRoot.nodeData, "click")
    }

    RowLayout {
        id: chipRow

        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: chipRemove.visible ? 4 : 12
        spacing: 2

        Label {
            id: chipLabel

            Layout.fillWidth: true
            horizontalAlignment: chipRemove.visible ? Text.AlignLeft : Text.AlignHCenter
            color: view.themeText
            font.family: view.fontFamily
            font.pixelSize: view.fs(13)
        }

        ToolButton {
            id: chipRemove

            text: "close"
            visible: false
            implicitWidth: 24
            implicitHeight: 24
            padding: 0
            font.family: view.iconFamily
            font.pixelSize: view.fs(16)

            contentItem: Label {
                text: chipRemove.text
                font: chipRemove.font
                color: chipRemove.hovered ? view.themeText : view.themeTextSecondary
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
            }

            onClicked: view.emitNodeEvent(chipRoot.nodeData, "remove")
        }
    }
}
