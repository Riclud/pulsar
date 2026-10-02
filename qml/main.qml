import QtQuick
import QtQuick.Controls

ApplicationWindow {
    id: win
    visible: true
    width: 640
    height: 480
    title: "Zig / QML / Bun bridge"

    property var pending: ({})

    function run(method, params) {
        var callback = function (result, error) {
            var pretty = typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2);
            if (error) {
                pretty = "ERR " + JSON.stringify(error);
            }
            log.text = pretty;
            console.log("[bridge]", method, "=>", pretty.replace(/\n/g, "\\n").slice(0, 400));
        };
        var id = bridge.invoke(method, params);
        pending[id] = callback;
        status.text = "#" + id + " -> " + method;
    }

    Column {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        Row {
            spacing: 8
            Label { text: "path:"; anchors.verticalCenter: parent.verticalCenter }
            TextField { id: pathField; text: "package.json"; width: 300 }
        }

        Row {
            spacing: 8
            Button { text: "fs.readFile"; onClicked: win.run("fs.readFile", { path: pathField.text }) }
            Button { text: "fs.listDir"; onClicked: win.run("fs.listDir", { path: pathField.text || "." }) }
            Button { text: "fs.writeFile"; onClicked: win.run("fs.writeFile", { path: pathField.text, content: "demo " + new Date().toISOString() + "\n" }) }
            Button { text: "zig.ping"; onClicked: win.run("zig.ping", {}) }
        }

        Row {
            spacing: 8
            Label { text: "url:"; anchors.verticalCenter: parent.verticalCenter }
            TextField { id: urlField; text: "https://example.com"; width: 300 }
            Button { text: "nw.fetch"; onClicked: win.run("nw.fetch", { url: urlField.text }) }
        }

        Label {
            id: status
            text: "waiting"
        }

        TextArea {
            id: log
            width: parent.width
            height: parent.height - 176
            readOnly: true
            placeholderText: "result"
        }
    }

    Component.onCompleted: {
        bridge.response.connect(function (id, result, error) {
            var cb = win.pending[id];
            if (cb) {
                delete win.pending[id];
                cb(result, error);
            }
        });
        bridge.ready.connect(function () {
            status.text = "bridge ready";
            win.run("fs.readFile", { path: "package.json" });
        });
    }
}