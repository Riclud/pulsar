import QtQuick
import QtQuick.Controls

ApplicationWindow {
    visible: true
    width: 400
    height: 240
    title: "Storage"

    Label {
        anchors.centerIn: parent
        text: Store.storageOk ? "ok" : "failed"
    }
}