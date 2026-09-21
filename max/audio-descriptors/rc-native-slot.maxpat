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
    "openinpresentation": 0,
    "boxes": [
      {
        "box": {
          "id": "signal",
          "maxclass": "newobj",
          "text": "inlet",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            20,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "control",
          "maxclass": "newobj",
          "text": "inlet",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            500,
            20,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "clamp",
          "maxclass": "newobj",
          "text": "clip~ 0. 1.",
          "numinlets": 3,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            80,
            69.3,
            22
          ]
        }
      },
      {
        "box": {
          "id": "remote",
          "maxclass": "newobj",
          "text": "live.remote~ @normalized 1 @smoothing 0",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            300,
            245.7,
            22
          ],
          "saved_object_attributes": {
            "_persistence": 0
          }
        }
      },
      {
        "box": {
          "id": "modulate",
          "maxclass": "newobj",
          "text": "live.modulate~ @smoothing 0",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            400,
            300,
            170.1,
            22
          ],
          "saved_object_attributes": {
            "_persistence": 0
          }
        }
      },
      {
        "box": {
          "id": "route",
          "maxclass": "newobj",
          "text": "route remote modulate release",
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
            70,
            182.7,
            22
          ]
        }
      },
      {
        "box": {
          "id": "remote-id",
          "maxclass": "newobj",
          "text": "prepend id",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            500,
            115,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "modulate-id",
          "maxclass": "newobj",
          "text": "prepend id",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            640,
            115,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "release",
          "maxclass": "message",
          "text": "id 0",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            780,
            250,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "load",
          "maxclass": "newobj",
          "text": "loadbang",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            780,
            50,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "free",
          "maxclass": "newobj",
          "text": "freebang",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            890,
            50,
            65,
            22
          ]
        }
      }
    ],
    "lines": [
      {
        "patchline": {
          "source": [
            "signal",
            0
          ],
          "destination": [
            "clamp",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "clamp",
            0
          ],
          "destination": [
            "remote",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "clamp",
            0
          ],
          "destination": [
            "modulate",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "control",
            0
          ],
          "destination": [
            "route",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route",
            0
          ],
          "destination": [
            "remote-id",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route",
            1
          ],
          "destination": [
            "modulate-id",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "remote-id",
            0
          ],
          "destination": [
            "remote",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "modulate-id",
            0
          ],
          "destination": [
            "modulate",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route",
            2
          ],
          "destination": [
            "release",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "load",
            0
          ],
          "destination": [
            "release",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "free",
            0
          ],
          "destination": [
            "release",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "release",
            0
          ],
          "destination": [
            "remote",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "release",
            0
          ],
          "destination": [
            "modulate",
            1
          ]
        }
      }
    ]
  }
}
