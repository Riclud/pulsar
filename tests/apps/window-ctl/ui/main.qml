import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    title: "Main"

    Label {
        anchors.centerIn: parent
        text: "main"
    }

    Connections {
        target: Pulsar

        function onAppEvent(event, payload, target) {
            if (target === "*" || target === PulsarWindowLabel)
                Pulsar.emit("ui-got", { event: event, target: target });
        }
    }
}
