import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true

    MenuBar {
        Menu {
            title: "File"
            MenuItem {
                text: "Increment"
                onTriggered: Pulsar.emit("increment", {})
            }
            MenuItem {
                text: "Toggle panel"
                onTriggered: Pulsar.emit("togglePanel", {})
            }
            MenuItem {
                text: "Open file..."
                onTriggered: Pulsar.emit("openFile", {})
            }
            MenuItem {
                text: "Message..."
                onTriggered: Pulsar.emit("showMessage", {})
            }
            MenuSeparator {}
            MenuItem {
                text: "Quit"
                onTriggered: Pulsar.emit("quit", {})
            }
        }
    }

    Column {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        Label {
            text: "Shared counter: " + (Store.counter ?? 0)
            font.pixelSize: 20
        }

        Label {
            text: "Panel open: " + (Store.panelOpen ? "yes" : "no")
        }

        Label {
            text: Store.lastClosed ? "Last closed window: " + Store.lastClosed : ""
            color: "#888"
        }

        Row {
            spacing: 8

            Button {
                text: "+1"
                onClicked: Pulsar.emit("increment", {})
            }

            Button {
                text: Store.panelOpen ? "Hide panel" : "Show panel"
                onClicked: Pulsar.emit("togglePanel", {})
            }

            Button {
                text: "Rename panel"
                onClicked: Pulsar.emit("renamePanel", {
                    title: "Panel " + ((Store.counter ?? 0) + 1)
                })
            }

            Button {
                text: "Open file..."
                onClicked: Pulsar.emit("openFile", {})
            }

            Button {
                text: "Message..."
                onClicked: Pulsar.emit("showMessage", {})
            }
        }

        Label {
            text: Store.picked ? "Picked: " + Store.picked : "No file picked yet"
            wrapMode: Text.WordWrap
            width: parent.width
            color: "#888"
        }

        Label {
            text: "Both windows share Store; the app controls them via app.window(label)."
            wrapMode: Text.WordWrap
            width: parent.width
            color: "#666"
        }
    }
}
