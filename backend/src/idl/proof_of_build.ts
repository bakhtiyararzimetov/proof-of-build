/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/proof_of_build.json`.
 */
export type ProofOfBuild = {
  "address": "8GYmgRJ9iRNE9kmBf5HkAfMu23Fdh6ES8XvXMbNdYvJw",
  "metadata": {
    "name": "proofOfBuild",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "claim",
      "docs": [
        "Pays whatever is available now; can be called again later for the rest",
        "(e.g. the deposit right after finalize, the prize once winners are known)."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true,
          "relations": [
            "participant"
          ]
        },
        {
          "name": "hackathon",
          "relations": [
            "team"
          ]
        },
        {
          "name": "team",
          "relations": [
            "participant"
          ]
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              }
            ]
          }
        },
        {
          "name": "walletToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createHackathon",
      "discriminator": [
        228,
        148,
        238,
        246,
        21,
        223,
        47,
        69
      ],
      "accounts": [
        {
          "name": "organizer",
          "writable": true,
          "signer": true
        },
        {
          "name": "hackathon",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  99,
                  107,
                  97,
                  116,
                  104,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "organizer"
              },
              {
                "kind": "arg",
                "path": "hackathonId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              }
            ]
          }
        },
        {
          "name": "organizerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "hackathonId",
          "type": "u64"
        },
        {
          "name": "oracle",
          "type": "pubkey"
        },
        {
          "name": "startTs",
          "type": "i64"
        },
        {
          "name": "endTs",
          "type": "i64"
        },
        {
          "name": "registrationEndTs",
          "type": "i64"
        },
        {
          "name": "depositAmount",
          "type": "u64"
        },
        {
          "name": "requiredFires",
          "type": "u16"
        },
        {
          "name": "prizeAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "disqualify",
      "docs": [
        "Organizer excludes a cheater. The deposit is forfeited to the prize pool (never to the",
        "organizer) and the participant gets no prize. Only before winners are set and before the",
        "participant is settled, so payouts computed later cannot change."
      ],
      "discriminator": [
        201,
        66,
        235,
        23,
        192,
        124,
        174,
        234
      ],
      "accounts": [
        {
          "name": "organizer",
          "signer": true,
          "relations": [
            "hackathon"
          ]
        },
        {
          "name": "hackathon",
          "writable": true,
          "relations": [
            "participant"
          ]
        },
        {
          "name": "participant",
          "writable": true
        },
        {
          "name": "team",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "reasonHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "finalize",
      "discriminator": [
        171,
        61,
        218,
        56,
        127,
        115,
        12,
        217
      ],
      "accounts": [
        {
          "name": "cranker",
          "signer": true
        },
        {
          "name": "hackathon",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "joinTeam",
      "discriminator": [
        244,
        30,
        215,
        53,
        96,
        145,
        4,
        206
      ],
      "accounts": [
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "oracle",
          "signer": true,
          "relations": [
            "hackathon"
          ]
        },
        {
          "name": "hackathon",
          "writable": true,
          "relations": [
            "team"
          ]
        },
        {
          "name": "team",
          "writable": true
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "githubLink",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  105,
                  116,
                  104,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              },
              {
                "kind": "arg",
                "path": "githubIdHash"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              }
            ]
          }
        },
        {
          "name": "walletToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "githubIdHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "recordAttestation",
      "discriminator": [
        148,
        43,
        225,
        77,
        15,
        134,
        217,
        54
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true,
          "relations": [
            "hackathon"
          ]
        },
        {
          "name": "hackathon",
          "relations": [
            "participant"
          ]
        },
        {
          "name": "participant"
        },
        {
          "name": "attestation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "participant"
              },
              {
                "kind": "arg",
                "path": "letterHash"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "letterHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "recordFire",
      "docs": [
        "`pushed_at` is GitHub's push time (repository.pushed_at). The day is derived from it,",
        "so a webhook that arrives late (up to FIRE_GRACE) still lands on the right day."
      ],
      "discriminator": [
        24,
        92,
        189,
        131,
        208,
        231,
        110,
        176
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true,
          "relations": [
            "hackathon"
          ]
        },
        {
          "name": "hackathon",
          "writable": true,
          "relations": [
            "participant"
          ]
        },
        {
          "name": "participant",
          "writable": true
        },
        {
          "name": "team",
          "writable": true
        },
        {
          "name": "fireRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  105,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "participant"
              },
              {
                "kind": "arg",
                "path": "dayIndex"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "dayIndex",
          "type": "u16"
        },
        {
          "name": "commitHash",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "pushedAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "registerTeam",
      "discriminator": [
        12,
        29,
        209,
        52,
        168,
        44,
        109,
        66
      ],
      "accounts": [
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "oracle",
          "signer": true,
          "relations": [
            "hackathon"
          ]
        },
        {
          "name": "hackathon",
          "writable": true
        },
        {
          "name": "team",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "githubLink",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  105,
                  116,
                  104,
                  117,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              },
              {
                "kind": "arg",
                "path": "githubIdHash"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              }
            ]
          }
        },
        {
          "name": "walletToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "githubIdHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "setWinners",
      "discriminator": [
        96,
        110,
        12,
        157,
        13,
        102,
        230,
        153
      ],
      "accounts": [
        {
          "name": "organizer",
          "signer": true,
          "relations": [
            "hackathon"
          ]
        },
        {
          "name": "hackathon",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "winners",
          "type": {
            "vec": {
              "defined": {
                "name": "winnerInput"
              }
            }
          }
        }
      ]
    },
    {
      "name": "sweep",
      "docs": [
        "After the claim window the organizer takes back what nobody claimed."
      ],
      "discriminator": [
        40,
        23,
        234,
        175,
        14,
        61,
        154,
        177
      ],
      "accounts": [
        {
          "name": "organizer",
          "signer": true,
          "relations": [
            "hackathon"
          ]
        },
        {
          "name": "hackathon"
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "hackathon"
              }
            ]
          }
        },
        {
          "name": "organizerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "attestation",
      "discriminator": [
        152,
        125,
        183,
        86,
        36,
        146,
        121,
        73
      ]
    },
    {
      "name": "fireRecord",
      "discriminator": [
        122,
        220,
        8,
        188,
        102,
        226,
        82,
        69
      ]
    },
    {
      "name": "githubLink",
      "discriminator": [
        100,
        53,
        57,
        80,
        27,
        27,
        125,
        106
      ]
    },
    {
      "name": "hackathon",
      "discriminator": [
        180,
        85,
        208,
        43,
        178,
        243,
        204,
        107
      ]
    },
    {
      "name": "participant",
      "discriminator": [
        32,
        142,
        108,
        79,
        247,
        179,
        54,
        6
      ]
    },
    {
      "name": "team",
      "discriminator": [
        140,
        218,
        177,
        140,
        193,
        241,
        199,
        106
      ]
    }
  ],
  "events": [
    {
      "name": "attestationRecorded",
      "discriminator": [
        207,
        97,
        52,
        58,
        217,
        238,
        97,
        21
      ]
    },
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "fireRecorded",
      "discriminator": [
        89,
        97,
        78,
        85,
        176,
        219,
        98,
        31
      ]
    },
    {
      "name": "hackathonFinalized",
      "discriminator": [
        231,
        43,
        80,
        145,
        109,
        138,
        15,
        108
      ]
    },
    {
      "name": "participantDisqualified",
      "discriminator": [
        116,
        237,
        78,
        6,
        146,
        173,
        196,
        12
      ]
    },
    {
      "name": "participantJoined",
      "discriminator": [
        48,
        182,
        206,
        15,
        56,
        181,
        24,
        253
      ]
    },
    {
      "name": "swept",
      "discriminator": [
        254,
        138,
        9,
        198,
        192,
        61,
        165,
        135
      ]
    },
    {
      "name": "teamRegistered",
      "discriminator": [
        34,
        196,
        222,
        157,
        183,
        10,
        215,
        104
      ]
    },
    {
      "name": "winnersSet",
      "discriminator": [
        128,
        237,
        22,
        100,
        81,
        28,
        15,
        96
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidTimeRange",
      "msg": "Invalid time range: start < end, end in the future, registration end in (now, end], duration <= 64 days"
    },
    {
      "code": 6001,
      "name": "invalidRequiredFires",
      "msg": "required_fires must be between 1 and the number of days"
    },
    {
      "code": 6002,
      "name": "zeroPrize",
      "msg": "prize_amount must be > 0"
    },
    {
      "code": 6003,
      "name": "nameTooLong",
      "msg": "Team name must be 1..=32 bytes"
    },
    {
      "code": 6004,
      "name": "registrationClosed",
      "msg": "Registration is closed"
    },
    {
      "code": 6005,
      "name": "teamFull",
      "msg": "The team already has 5 members"
    },
    {
      "code": 6006,
      "name": "depositAccountMissing",
      "msg": "wallet_token is required when deposit_amount > 0"
    },
    {
      "code": 6007,
      "name": "unauthorizedOracle",
      "msg": "The signer is not the hackathon oracle"
    },
    {
      "code": 6008,
      "name": "unauthorizedOrganizer",
      "msg": "The signer is not the hackathon organizer"
    },
    {
      "code": 6009,
      "name": "hackathonNotStarted",
      "msg": "The hackathon has not started yet"
    },
    {
      "code": 6010,
      "name": "hackathonEnded",
      "msg": "The hackathon has already ended"
    },
    {
      "code": 6011,
      "name": "hackathonNotEnded",
      "msg": "Settlement has not started yet (end_ts + grace period)"
    },
    {
      "code": 6012,
      "name": "wrongDayIndex",
      "msg": "day_index does not match the push day"
    },
    {
      "code": 6013,
      "name": "dayAlreadyRecorded",
      "msg": "A fire for this day has already been recorded"
    },
    {
      "code": 6014,
      "name": "winnersAlreadySet",
      "msg": "Winners have already been set"
    },
    {
      "code": 6015,
      "name": "invalidWinners",
      "msg": "Invalid winners: 1..=3 distinct teams, bps > 0, sum of bps == 10000"
    },
    {
      "code": 6016,
      "name": "winnerTeamMismatch",
      "msg": "A winning team does not belong to this hackathon"
    },
    {
      "code": 6017,
      "name": "alreadySettled",
      "msg": "The participant has already been settled"
    },
    {
      "code": 6018,
      "name": "wrongHackathon",
      "msg": "The account belongs to a different hackathon"
    },
    {
      "code": 6019,
      "name": "notFinalized",
      "msg": "The hackathon is not finalized yet"
    },
    {
      "code": 6020,
      "name": "winnersNotSet",
      "msg": "Winners have not been set yet"
    },
    {
      "code": 6021,
      "name": "alreadyClaimed",
      "msg": "Already claimed"
    },
    {
      "code": 6022,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6023,
      "name": "notTeamMember",
      "msg": "The participant is not a member of this team"
    },
    {
      "code": 6024,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6025,
      "name": "alreadyFinalized",
      "msg": "The hackathon is already finalized"
    },
    {
      "code": 6026,
      "name": "accountNotWritable",
      "msg": "Participant accounts passed to finalize must be writable"
    },
    {
      "code": 6027,
      "name": "organizerCannotParticipate",
      "msg": "The organizer cannot participate in their own hackathon"
    },
    {
      "code": 6028,
      "name": "invalidPushTime",
      "msg": "pushed_at is in the future"
    },
    {
      "code": 6029,
      "name": "fireTooLate",
      "msg": "The push is older than the grace period"
    },
    {
      "code": 6030,
      "name": "disqualified",
      "msg": "The participant is disqualified"
    },
    {
      "code": 6031,
      "name": "alreadyDisqualified",
      "msg": "The participant is already disqualified"
    },
    {
      "code": 6032,
      "name": "winnersDeadlinePassed",
      "msg": "The deadline for choosing winners has passed"
    },
    {
      "code": 6033,
      "name": "teamNotQualified",
      "msg": "Nobody in this team met the goal"
    },
    {
      "code": 6034,
      "name": "claimWindowOpen",
      "msg": "The claim window is still open"
    }
  ],
  "types": [
    {
      "name": "attestation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "participant",
            "type": "pubkey"
          },
          {
            "name": "letterHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "attestationRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "participant",
            "type": "pubkey"
          },
          {
            "name": "letterHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "participant",
            "type": "pubkey"
          },
          {
            "name": "depositRefund",
            "type": "u64"
          },
          {
            "name": "prizeShare",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fireRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "participant",
            "type": "pubkey"
          },
          {
            "name": "dayIndex",
            "type": "u16"
          },
          {
            "name": "commitHash",
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "pushedAt",
            "docs": [
              "GitHub's push time"
            ],
            "type": "i64"
          },
          {
            "name": "recordedAt",
            "docs": [
              "On-chain time the fire was recorded"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fireRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "participant",
            "type": "pubkey"
          },
          {
            "name": "dayIndex",
            "type": "u16"
          },
          {
            "name": "commitHash",
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "fires",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "githubLink",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "participant",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "hackathon",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "organizer",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "hackathonId",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "registrationEndTs",
            "type": "i64"
          },
          {
            "name": "depositAmount",
            "type": "u64"
          },
          {
            "name": "requiredFires",
            "type": "u16"
          },
          {
            "name": "prizePool",
            "docs": [
              "Prizes + forfeited deposits (grows during finalize)."
            ],
            "type": "u64"
          },
          {
            "name": "teamCount",
            "type": "u32"
          },
          {
            "name": "participantCount",
            "type": "u32"
          },
          {
            "name": "settledCount",
            "type": "u32"
          },
          {
            "name": "qualifiedCount",
            "docs": [
              "Participants with fires >= required_fires who are not disqualified."
            ],
            "type": "u32"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "hackathonStatus"
              }
            }
          },
          {
            "name": "winnersSet",
            "type": "bool"
          },
          {
            "name": "winnerCount",
            "type": "u8"
          },
          {
            "name": "winners",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "winner"
                  }
                },
                3
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "hackathonFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "prizePool",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "hackathonStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "finalized"
          }
        ]
      }
    },
    {
      "name": "participant",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "githubIdHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "fires",
            "type": "u16"
          },
          {
            "name": "daysBitmap",
            "docs": [
              "Bit i = a fire on day i."
            ],
            "type": "u64"
          },
          {
            "name": "depositPaid",
            "type": "bool"
          },
          {
            "name": "disqualified",
            "type": "bool"
          },
          {
            "name": "disqualifyReason",
            "docs": [
              "SHA-256 of the organizer's reason text (the text itself is off-chain)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "refundClaimed",
            "type": "bool"
          },
          {
            "name": "prizeClaimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "participantDisqualified",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "participant",
            "type": "pubkey"
          },
          {
            "name": "reasonHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "participantJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "participant",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "swept",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "team",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "captain",
            "type": "pubkey"
          },
          {
            "name": "members",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "qualifiedCount",
            "docs": [
              "Members who met the goal; the team's prize share is split between them only."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "teamRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "captain",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "winner",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "bps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "winnerInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "team",
            "type": "pubkey"
          },
          {
            "name": "bps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "winnersSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hackathon",
            "type": "pubkey"
          },
          {
            "name": "winners",
            "type": {
              "vec": {
                "defined": {
                  "name": "winner"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
