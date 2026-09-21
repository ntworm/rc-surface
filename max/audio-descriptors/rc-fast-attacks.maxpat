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
          "id": "left",
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
          "id": "right",
          "maxclass": "newobj",
          "text": "inlet",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            180,
            20,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "ctl",
          "maxclass": "newobj",
          "text": "inlet",
          "numinlets": 0,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            650,
            20,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "l2",
          "maxclass": "newobj",
          "text": "*~",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            65,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "r2",
          "maxclass": "newobj",
          "text": "*~",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            180,
            65,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "sum",
          "maxclass": "newobj",
          "text": "+~",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            110,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "power",
          "maxclass": "newobj",
          "text": "*~ 0.5",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
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
          "id": "fast",
          "maxclass": "newobj",
          "text": "slide~ 48.501736 48.501736",
          "numinlets": 3,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            190,
            163.79999999999998,
            22
          ]
        }
      },
      {
        "box": {
          "id": "slow",
          "maxclass": "newobj",
          "text": "slide~ 1440.500058 1440.500058",
          "numinlets": 3,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            310,
            190,
            189,
            22
          ]
        }
      },
      {
        "box": {
          "id": "f",
          "maxclass": "newobj",
          "text": "sqrt~",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            235,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "s",
          "maxclass": "newobj",
          "text": "sqrt~",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            310,
            235,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "difference",
          "maxclass": "newobj",
          "text": "-~",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            280,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "total",
          "maxclass": "newobj",
          "text": "+~",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            250,
            280,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "epsilon",
          "maxclass": "newobj",
          "text": "+~ 0.00000001",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            250,
            320,
            81.89999999999999,
            22
          ]
        }
      },
      {
        "box": {
          "id": "ratio",
          "maxclass": "newobj",
          "text": "/~",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            360,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "positive",
          "maxclass": "newobj",
          "text": "maximum~ 0.",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            400,
            69.3,
            22
          ]
        }
      },
      {
        "box": {
          "id": "knee",
          "maxclass": "newobj",
          "text": "-~ 0.2295",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            440,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "denominator",
          "maxclass": "newobj",
          "text": "/~ 0.7705",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            480,
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
            520,
            69.3,
            22
          ]
        }
      },
      {
        "box": {
          "id": "curve",
          "maxclass": "newobj",
          "text": "pow~ 1.",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            560,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "floor",
          "maxclass": "newobj",
          "text": ">=~ 0.0001",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            400,
            280,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "gate",
          "maxclass": "newobj",
          "text": "*~",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            600,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "release",
          "maxclass": "newobj",
          "text": "slide~ 1. 2160.500039",
          "numinlets": 3,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            20,
            640,
            132.29999999999998,
            22
          ]
        }
      },
      {
        "box": {
          "id": "out",
          "maxclass": "newobj",
          "text": "outlet",
          "numinlets": 1,
          "numoutlets": 0,
          "outlettype": [],
          "patching_rect": [
            20,
            690,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "route",
          "maxclass": "newobj",
          "text": "route fast-slide slow-slide release-slide knee denominator curve reset",
          "numinlets": 1,
          "numoutlets": 8,
          "outlettype": [
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
          ],
          "patching_rect": [
            650,
            65,
            441,
            22
          ]
        }
      },
      {
        "box": {
          "id": "reset",
          "maxclass": "message",
          "text": "reset",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [
            ""
          ],
          "patching_rect": [
            650,
            500,
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
            "left",
            0
          ],
          "destination": [
            "l2",
            0
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
            "l2",
            1
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
            "r2",
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
            "r2",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "l2",
            0
          ],
          "destination": [
            "sum",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "r2",
            0
          ],
          "destination": [
            "sum",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "sum",
            0
          ],
          "destination": [
            "power",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "power",
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
            "power",
            0
          ],
          "destination": [
            "slow",
            0
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
            "f",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "slow",
            0
          ],
          "destination": [
            "s",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "f",
            0
          ],
          "destination": [
            "difference",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "s",
            0
          ],
          "destination": [
            "difference",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "f",
            0
          ],
          "destination": [
            "total",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "s",
            0
          ],
          "destination": [
            "total",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "total",
            0
          ],
          "destination": [
            "epsilon",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "difference",
            0
          ],
          "destination": [
            "ratio",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "epsilon",
            0
          ],
          "destination": [
            "ratio",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "ratio",
            0
          ],
          "destination": [
            "positive",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "positive",
            0
          ],
          "destination": [
            "knee",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "knee",
            0
          ],
          "destination": [
            "denominator",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "denominator",
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
            "curve",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "curve",
            0
          ],
          "destination": [
            "gate",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "f",
            0
          ],
          "destination": [
            "floor",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "floor",
            0
          ],
          "destination": [
            "gate",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "gate",
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
            "out",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "ctl",
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
            "fast",
            1
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
            "fast",
            2
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
            "slow",
            1
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
            "slow",
            2
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
            2
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route",
            3
          ],
          "destination": [
            "knee",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route",
            4
          ],
          "destination": [
            "denominator",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route",
            5
          ],
          "destination": [
            "curve",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "route",
            6
          ],
          "destination": [
            "reset",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "reset",
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
            "reset",
            0
          ],
          "destination": [
            "slow",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "reset",
            0
          ],
          "destination": [
            "release",
            0
          ]
        }
      }
    ]
  }
}
