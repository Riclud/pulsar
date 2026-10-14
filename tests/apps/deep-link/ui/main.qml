import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    title: "Deep link"

    Label {
        anchors.centerIn: parent
        text: Store.openUrl ? Store.openUrl : "no url"
    }
}
