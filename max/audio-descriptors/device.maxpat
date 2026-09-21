{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 9,
      "minor": 1,
      "revision": 4,
      "architecture": "x64",
      "modernui": 1
    },
    "classnamespace": "box",
    "rect": [
      80,
      80,
      1040,
      760
    ],
    "openinpresentation": 1,
    "boxes": [
      {
        "box": {
          "id": "title",
          "maxclass": "comment",
          "text": "RC AUDIO DESCRIPTORS — EXPERIMENTAL / EXPERIMENTAL",
          "numinlets": 1,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            20,
            10,
            315,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            5,
            510,
            20
          ]
        }
      },
      {
        "box": {
          "id": "warning",
          "maxclass": "comment",
          "text": "Gate A only: broadband transient. No Track UI yet. / Só transiente; ainda sem modo Track na página.",
          "numinlets": 1,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            20,
            35,
            520,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            27,
            510,
            28
          ]
        }
      },
      {
        "box": {
          "id": "input",
          "maxclass": "newobj",
          "text": "plugin~",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "",
            ""
          ],
          "patching_rect": [
            20,
            150,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "output",
          "maxclass": "newobj",
          "text": "plugout~",
          "numinlets": 2,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            170,
            150,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "fast",
          "maxclass": "newobj",
          "text": "rc-fast-attacks",
          "numinlets": 3,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            220,
            94.5,
            22
          ]
        }
      },
      {
        "box": {
          "id": "slot",
          "maxclass": "newobj",
          "text": "rc-native-slot",
          "numinlets": 2,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            20,
            275,
            88.2,
            22
          ]
        }
      },
      {
        "box": {
          "id": "controller",
          "maxclass": "newobj",
          "text": "js rc-device-control.js",
          "numinlets": 1,
          "numoutlets": 4,
          "outlettype": [
            "",
            "",
            "",
            ""
          ],
          "patching_rect": [
            500,
            220,
            144.9,
            22
          ],
          "varname": "controller"
        }
      },
      {
        "box": {
          "id": "defer-control",
          "maxclass": "newobj",
          "text": "deferlow",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            500,
            175,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "thisdevice",
          "maxclass": "newobj",
          "text": "live.thisdevice",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": [
            "",
            "",
            ""
          ],
          "patching_rect": [
            750,
            100,
            94.5,
            22
          ]
        }
      },
      {
        "box": {
          "id": "init",
          "maxclass": "message",
          "text": "init",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            750,
            140,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "device-off",
          "maxclass": "newobj",
          "text": "sel 0",
          "numinlets": 2,
          "numoutlets": 2,
          "outlettype": [
            "",
            ""
          ],
          "patching_rect": [
            880,
            140,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "dsp",
          "maxclass": "newobj",
          "text": "dspstate~",
          "numinlets": 1,
          "numoutlets": 4,
          "outlettype": [
            "int",
            "float",
            "int",
            "int"
          ],
          "patching_rect": [
            240,
            210,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "rate",
          "maxclass": "newobj",
          "text": "prepend samplerate",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            240,
            245,
            113.39999999999999,
            22
          ]
        }
      },
      {
        "box": {
          "id": "node",
          "maxclass": "newobj",
          "text": "node.script rc-bridge.cjs @autostart 0 @restart 0",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "",
            ""
          ],
          "patching_rect": [
            500,
            450,
            308.7,
            22
          ]
        }
      },
      {
        "box": {
          "id": "node-route",
          "maxclass": "newobj",
          "text": "route pairnonce status",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": [
            "",
            "",
            ""
          ],
          "patching_rect": [
            500,
            500,
            138.6,
            22
          ]
        }
      },
      {
        "box": {
          "id": "status-route",
          "maxclass": "newobj",
          "text": "route status",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "",
            ""
          ],
          "patching_rect": [
            500,
            310,
            75.6,
            22
          ]
        }
      },
      {
        "box": {
          "id": "status-display",
          "maxclass": "message",
          "text": "off",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            500,
            350,
            65,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            118,
            500,
            22
          ]
        }
      },
      {
        "box": {
          "id": "identity-store",
          "maxclass": "newobj",
          "text": "pattr rc_identity @bindto controller",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": [
            "",
            "",
            ""
          ],
          "patching_rect": [
            780,
            350,
            226.79999999999998,
            22
          ],
          "parameter_enable": 1,
          "parameter_mappable": 0,
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "RC Device Identity",
              "parameter_shortname": "DeviceID",
              "parameter_type": 3
            }
          }
        }
      },
      {
        "box": {
          "id": "announce-clock",
          "maxclass": "newobj",
          "text": "qmetro 1000",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            780,
            420,
            69.3,
            22
          ]
        }
      },
      {
        "box": {
          "id": "start-clock",
          "maxclass": "message",
          "text": "1",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            780,
            385,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "announce",
          "maxclass": "message",
          "text": "announce",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            780,
            450,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "open-probe",
          "maxclass": "newobj",
          "text": "opendialog JSON",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "",
            ""
          ],
          "patching_rect": [
            500,
            600,
            94.5,
            22
          ]
        }
      },
      {
        "box": {
          "id": "connect-probe",
          "maxclass": "newobj",
          "text": "prepend connect",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            500,
            640,
            94.5,
            22
          ]
        }
      },
      {
        "box": {
          "id": "off",
          "maxclass": "message",
          "text": "off",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            12,
            66,
            65,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            60,
            60,
            22
          ]
        }
      },
      {
        "box": {
          "id": "prepare",
          "maxclass": "message",
          "text": "prepare",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            335,
            101,
            65,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            330,
            93,
            95,
            22
          ]
        }
      },
      {
        "box": {
          "id": "arm",
          "maxclass": "message",
          "text": "arm",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            450,
            101,
            65,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            435,
            93,
            75,
            22
          ]
        }
      },
      {
        "box": {
          "id": "remote-mode",
          "maxclass": "message",
          "text": "mode 0",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            112,
            66,
            65,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            80,
            60,
            80,
            22
          ]
        }
      },
      {
        "box": {
          "id": "mod-mode",
          "maxclass": "message",
          "text": "mode 1",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            230,
            66,
            65,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            170,
            60,
            80,
            22
          ]
        }
      },
      {
        "box": {
          "id": "start-node",
          "maxclass": "message",
          "text": "script start",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            12,
            218,
            75.6,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            545,
            35,
            100,
            22
          ]
        }
      },
      {
        "box": {
          "id": "stop-node",
          "maxclass": "message",
          "text": "script stop",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            122,
            218,
            69.3,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            655,
            35,
            100,
            22
          ]
        }
      },
      {
        "box": {
          "id": "choose-probe",
          "maxclass": "message",
          "text": "bang",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            235,
            218,
            65,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            765,
            35,
            75,
            22
          ]
        }
      },
      {
        "box": {
          "id": "settings",
          "maxclass": "message",
          "text": "settings 0.65 45. 1.",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            12,
            153,
            126,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            260,
            60,
            250,
            22
          ]
        }
      },
      {
        "box": {
          "id": "target-label",
          "maxclass": "comment",
          "text": "Paste top-level Copy LOM Path; send text, then prepare → arm. OFF releases. / Colar caminho; preparar → armar.",
          "numinlets": 1,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            12,
            110,
            520,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            140,
            510,
            24
          ]
        }
      },
      {
        "box": {
          "id": "path",
          "maxclass": "textedit",
          "text": "",
          "numinlets": 1,
          "numoutlets": 3,
          "outlettype": [
            "",
            "",
            ""
          ],
          "patching_rect": [
            20,
            100,
            65,
            22
          ],
          "keymode": 1,
          "presentation": 1,
          "presentation_rect": [
            10,
            93,
            310,
            24
          ]
        }
      },
      {
        "box": {
          "id": "path-route",
          "maxclass": "newobj",
          "text": "route text",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "",
            ""
          ],
          "patching_rect": [
            20,
            375,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "path-command",
          "maxclass": "newobj",
          "text": "prepend targetpath",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            410,
            113.39999999999999,
            22
          ]
        }
      },
      {
        "box": {
          "id": "nonce",
          "maxclass": "number",
          "text": "",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": [
            "",
            ""
          ],
          "patching_rect": [
            700,
            550,
            65,
            22
          ],
          "varname": "_RC PairNonce",
          "parameter_enable": 1,
          "minimum": 0,
          "maximum": 16777215,
          "presentation": 1,
          "presentation_rect": [
            645,
            90,
            195,
            22
          ],
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "_RC PairNonce",
              "parameter_shortname": "PairNonce",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 16777215,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ],
              "parameter_unitstyle": 0
            }
          }
        }
      },
      {
        "box": {
          "id": "nonce-label",
          "maxclass": "comment",
          "text": "PairNonce / v1",
          "numinlets": 1,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            820,
            550,
            88.2,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            545,
            90,
            95,
            22
          ]
        }
      },
      {
        "box": {
          "id": "nonce-command",
          "maxclass": "newobj",
          "text": "prepend nonce",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            700,
            600,
            81.89999999999999,
            22
          ]
        }
      },
      {
        "box": {
          "id": "network-status",
          "maxclass": "message",
          "text": "probe_off",
          "numinlets": 2,
          "numoutlets": 1,
          "patching_rect": [
            540,
            535,
            300,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            545,
            62,
            295,
            22
          ]
        }
      },
      {
        "box": {
          "id": "probe-label",
          "maxclass": "comment",
          "text": "NODE PROBE — optional / opcional",
          "patching_rect": [
            540,
            510,
            300,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            545,
            8,
            295,
            22
          ]
        }
      },
      {
        "box": {
          "id": "device-enabled",
          "maxclass": "newobj",
          "text": "prepend deviceenabled",
          "numinlets": 1,
          "numoutlets": 1,
          "patching_rect": [
            880,
            180,
            140,
            22
          ]
        }
      }
    ],
    "lines": [
      {
        "patchline": {
          "source": [
            "input",
            0
          ],
          "destination": [
            "output",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "input",
            1
          ],
          "destination": [
            "output",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "input",
            0
          ],
          "destination": [
            "fast",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "input",
            1
          ],
          "destination": [
            "fast",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "fast",
            0
          ],
          "destination": [
            "slot",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "controller",
            0
          ],
          "destination": [
            "fast",
            2
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "controller",
            1
          ],
          "destination": [
            "slot",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "controller",
            2
          ],
          "destination": [
            "status-route",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "controller",
            3
          ],
          "destination": [
            "node",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "defer-control",
            0
          ],
          "destination": [
            "controller",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "thisdevice",
            0
          ],
          "destination": [
            "init",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "init",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "thisdevice",
            1
          ],
          "destination": [
            "device-off",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "device-off",
            0
          ],
          "destination": [
            "off",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "dsp",
            1
          ],
          "destination": [
            "rate",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "rate",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "path",
            0
          ],
          "destination": [
            "path-route",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "path-route",
            0
          ],
          "destination": [
            "path-command",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "path-command",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "status-route",
            0
          ],
          "destination": [
            "status-display",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "node",
            0
          ],
          "destination": [
            "node-route",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "node-route",
            0
          ],
          "destination": [
            "nonce",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "node-route",
            1
          ],
          "destination": [
            "network-status",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "nonce",
            0
          ],
          "destination": [
            "nonce-command",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "nonce-command",
            0
          ],
          "destination": [
            "node",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "start-node",
            0
          ],
          "destination": [
            "node",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "stop-node",
            0
          ],
          "destination": [
            "node",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "choose-probe",
            0
          ],
          "destination": [
            "open-probe",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "open-probe",
            0
          ],
          "destination": [
            "connect-probe",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "connect-probe",
            0
          ],
          "destination": [
            "node",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "thisdevice",
            0
          ],
          "destination": [
            "start-clock",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "start-clock",
            0
          ],
          "destination": [
            "announce-clock",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "announce-clock",
            0
          ],
          "destination": [
            "announce",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "announce",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "off",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "prepare",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "arm",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "remote-mode",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "mod-mode",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "settings",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "thisdevice",
            1
          ],
          "destination": [
            "device-enabled",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "device-enabled",
            0
          ],
          "destination": [
            "defer-control",
            0
          ]
        }
      }
    ],
    "devicewidth": 870,
    "parameters": {
      "nonce": [
        "_RC PairNonce",
        "PairNonce",
        0
      ],
      "parameterbanks": {
        "0": {
          "index": 0,
          "name": "RC Native Probe",
          "parameters": [
            "nonce",
            "-",
            "-",
            "-",
            "-",
            "-",
            "-",
            "-"
          ]
        }
      },
      "inherited_shortname": 1,
      "identity-store": [
        "RC Device Identity",
        "DeviceID",
        0
      ]
    }
  }
}
