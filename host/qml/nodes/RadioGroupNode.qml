import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

GridLayout {
    id: groupRoot

    required property Window view
    property var pulsarMeta: null
    property var nodeData: null
    property var options: []
    property var value: undefined
    property bool horizontal: false
    property color accent: view.themePrimary

    columns: horizontal ? -1 : 1
    columnSpacing: 16
    rowSpacing: 4
    flow: GridLayout.LeftToRight

    function syncChecked() {
        for (let i = 0; i < groupRepeater.count; i++) {
            const button = groupRepeater.itemAt(i);

            if (button)
                button.checked = groupRoot.value === button.modelData.value;
        }
    }

    onValueChanged: syncChecked()
    onOptionsChanged: syncChecked()
    Component.onCompleted: syncChecked()

    Repeater {
        id: groupRepeater

        model: groupRoot.options

        delegate: RadioButton {
            id: optionRoot

            required property var modelData
            required property int index

            autoExclusive: false
            checked: false
            text: modelData.label
            spacing: 10
            leftPadding: 0
            rightPadding: 0
            topPadding: 4
            bottomPadding: 4
            font.family: view.fontFamily
            font.pixelSize: view.fs(15)
            Layout.fillWidth: groupRoot.horizontal

            onClicked: {
                if (groupRoot.value === modelData.value)
                    return;

                groupRoot.value = modelData.value;
                groupRoot.syncChecked();
                view.emitNodeEvent(groupRoot.nodeData, "change", modelData.value);
            }

            indicator: Item {
                implicitWidth: 22
                implicitHeight: 22

                Rectangle {
                    anchors.fill: parent
                    radius: width / 2
                    color: "transparent"
                    border.width: optionRoot.checked ? 0 : 1.5
                    border.color: optionRoot.checked ? groupRoot.accent
                            : optionRoot.hovered ? groupRoot.accent : view.themeBorder

                    Behavior on border.color {
                        ColorAnimation { duration: view.motionFast }
                    }
                }

                Rectangle {
                    anchors.centerIn: parent
                    width: optionRoot.checked ? 14 : 0
                    height: width
                    radius: width / 2
                    color: groupRoot.accent

                    Behavior on width {
                        NumberAnimation {
                            duration: view.motionFast
                            easing.type: Easing.OutCubic
                        }
                    }
                }
            }

            contentItem: Label {
                text: optionRoot.text
                color: optionRoot.enabled ? view.themeText : view.themeTextSecondary
                font: optionRoot.font
                verticalAlignment: Text.AlignVCenter
                leftPadding: optionRoot.indicator.width + optionRoot.spacing
            }
        }
    }
}
