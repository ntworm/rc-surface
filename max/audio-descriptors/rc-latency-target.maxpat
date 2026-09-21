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
      650,
      450
    ],
    "openinpresentation": 1,
    "devicewidth": 520,
    "boxes": [
      {
        "box": {
          "id": "input",
          "maxclass": "newobj",
          "text": "plugin~",
          "numinlets": 1,
          "numoutlets": 2,
          "patching_rect": [
            20,
            140,
            100,
            22
          ],
          "outlettype": [
            "signal",
            "signal"
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
          "patching_rect": [
            20,
            300,
            100,
            22
          ],
          "outlettype": []
        }
      },
      {
        "box": {
          "id": "left",
          "maxclass": "newobj",
          "text": "*~",
          "numinlets": 2,
          "numoutlets": 1,
          "patching_rect": [
            20,
            245,
            100,
            22
          ],
          "outlettype": [
            "signal"
          ]
        }
      },
      {
        "box": {
          "id": "right",
          "maxclass": "newobj",
          "text": "*~",
          "numinlets": 2,
          "numoutlets": 1,
          "patching_rect": [
            150,
            245,
            100,
            22
          ],
          "outlettype": [
            "signal"
          ]
        }
      },
      {
        "box": {
          "id": "level",
          "maxclass": "newobj",
          "text": "sig~ 0.",
          "numinlets": 1,
          "numoutlets": 1,
          "patching_rect": [
            320,
            180,
            100,
            22
          ],
          "outlettype": [
            "signal"
          ]
        }
      },
      {
        "box": {
          "id": "gain",
          "maxclass": "live.dial",
          "numinlets": 1,
          "numoutlets": 2,
          "patching_rect": [
            320,
            80,
            60,
            60
          ],
          "presentation": 1,
          "presentation_rect": [
            15,
            55,
            60,
            60
          ],
          "parameter_enable": 1,
          "varname": "Test Gain",
          "saved_attribute_attributes": {
            "valueof": {
              "parameter_longname": "Test Gain",
              "parameter_shortname": "Gain",
              "parameter_type": 0,
              "parameter_mmin": 0,
              "parameter_mmax": 1,
              "parameter_initial_enable": 1,
              "parameter_initial": [
                0
              ]
            }
          }
        }
      },
      {
        "box": {
          "id": "title",
          "maxclass": "comment",
          "text": "RC LATENCY TARGET — TEST ONLY / SÓ TESTE",
          "patching_rect": [
            10,
            10,
            500,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            10,
            500,
            22
          ]
        }
      },
      {
        "box": {
          "id": "warning",
          "maxclass": "comment",
          "text": "Linear gain 0–1. DC carrier: DO NOT route to speakers. / NÃO enviar DC às caixas.",
          "patching_rect": [
            10,
            40,
            500,
            32
          ],
          "presentation": 1,
          "presentation_rect": [
            90,
            55,
            410,
            45
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
            "left",
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
            "right",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "gain",
            0
          ],
          "destination": [
            "level",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "level",
            0
          ],
          "destination": [
            "left",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "level",
            0
          ],
          "destination": [
            "right",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "left",
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
            "right",
            0
          ],
          "destination": [
            "output",
            1
          ]
        }
      }
    ],
    "parameters": {
      "gain": [
        "Test Gain",
        "Gain",
        0
      ],
      "parameterbanks": {
        "0": {
          "index": 0,
          "name": "Latency reference",
          "parameters": [
            "gain",
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
      "inherited_shortname": 1
    }
  }
}
