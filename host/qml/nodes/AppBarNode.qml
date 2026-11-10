import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: bar

    required property Window view

    implicitHeight: 56
    property var pulsarMeta: null
    property var nodeData: null
    property alias actionsRow: actions
    property alias titleLabel: titleText
    property alias subtitleLabel: subtitleText
    property alias backButton: back

    color: view.themeSurface

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        spacing: 4

        ToolButton {
            id: back

            text: "arrow_back"
            visible: false
            font.family: view.iconFamily
            font.pixelSize: view.fs(24)

            contentItem: Label {
                text: back.text
                font: back.font
                color: back.hovered ? view.themeText : view.themeTextSecondary
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
            }

            onClicked: view.emitNodeEvent(bar.nodeData, "back")
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 0

            Label {
                id: titleText

                Layout.fillWidth: true
                elide: Text.ElideRight
                color: view.themeText
                font.pixelSize: view.fs(18)
                font.bold: true
            }

            Label {
                id: subtitleText

                Layout.fillWidth: true
                visible: text.length > 0
                elide: Text.ElideRight
                color: view.themeTextSecondary
                font.pixelSize: view.fs(12)
            }
        }

        RowLayout {
            id: actions
            property var pulsarMeta: null
            spacing: 0
        }
    }

    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 1
        color: view.themeBorder
    }
}
