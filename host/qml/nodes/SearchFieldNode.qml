import QtQuick
import QtQuick.Controls

TextField {
    id: searchRoot

    required property Window view
    property var pulsarMeta: null
    property var nodeData: null
    property bool outlined: false
    property color fieldColor: view.themeSurfaceVariant
    property color fieldBorderColor: view.themeBorder
    property int fieldRadius: 8
    property int debounce: 0
    property string hint: ""
    property alias clearButton: searchClear
    property alias inputTimer: debounceTimer

    color: view.themeText
    placeholderText: ""
    placeholderTextColor: view.themeTextSecondary
    font.family: view.fontFamily
    font.pixelSize: view.fs(15)
    inputMethodHints: Qt.ImhNoPredictiveText
    leftPadding: 40
    rightPadding: searchClear.visible ? 40 : 12
    implicitHeight: 40

    background: Rectangle {
        color: searchRoot.fieldColor
        radius: searchRoot.fieldRadius
        border.width: searchRoot.activeFocus ? 2 : searchRoot.outlined ? 1 : 0
        border.color: searchRoot.activeFocus ? view.themePrimary : searchRoot.fieldBorderColor

        Behavior on border.width {
            NumberAnimation { duration: view.motionFast }
        }
    }

    Label {
        anchors.left: parent.left
        anchors.leftMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        text: "search"
        font.family: view.iconFamily
        font.pixelSize: view.fs(20)
        color: searchRoot.activeFocus ? view.themePrimary : view.themeTextSecondary
    }

    Label {
        anchors.left: parent.left
        anchors.leftMargin: 40
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(0, searchRoot.width - 52)
        text: searchRoot.hint
        visible: searchRoot.text.length === 0 && searchRoot.preeditText.length === 0
        elide: Text.ElideRight
        color: view.themeTextSecondary
        font.family: view.fontFamily
        font.pixelSize: view.fs(15)
    }

    ToolButton {
        id: searchClear

        anchors.right: parent.right
        anchors.rightMargin: 4
        anchors.verticalCenter: parent.verticalCenter
        width: 32
        height: 32
        visible: searchRoot.text.length > 0
        hoverEnabled: true

        HoverHandler {
            cursorShape: Qt.PointingHandCursor
        }

        background: Rectangle {
            radius: 16
            color: searchClear.hovered ? view.withAlpha(view.themeText, 0.08) : "transparent"
        }

        contentItem: Label {
            text: "close"
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            font.family: view.iconFamily
            font.pixelSize: view.fs(18)
            color: view.themeTextSecondary
        }

        onClicked: {
            searchRoot.text = "";
            view.emitNodeEvent(searchRoot.nodeData, "clear");
            view.emitNodeEvent(searchRoot.nodeData, "input", "");
        }
    }

    Timer {
        id: debounceTimer

        interval: Math.max(0, searchRoot.debounce)

        onTriggered: view.emitNodeEvent(searchRoot.nodeData, "input", searchRoot.displayText)
    }
}
