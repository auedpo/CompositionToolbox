// Purpose: Domain model that represents the Edo Notation data used across the application.

using System;
using System.Collections.Generic;

namespace CompositionToolbox.App.Models
{
    public static class EdoNotation
    {
        private static readonly Dictionary<int, string[]> SpellingsByModulus = new()
        {
            {
                19,
                new[]
                {
                    "C", "C#", "Db", "D", "D#", "Eb", "E", "E#", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B", "B#"
                }
            },
            {
                31,
                new[]
                {
                    "C", "C+", "C#", "Db", "Dd", "D", "D+", "D#", "Eb", "Ed", "E", "E+", "E#", "F", "F+", "F#", "Gb", "Gd",
                    "G", "G+", "G#", "Ab", "Ad", "A", "A+", "A#", "Bb", "Bd", "B", "Cb", "Cd"
                }
            }
        };

        private static readonly Dictionary<char, int> NaturalSemitones = new()
        {
            { 'C', 0 },
            { 'D', 2 },
            { 'E', 4 },
            { 'F', 5 },
            { 'G', 7 },
            { 'A', 9 },
            { 'B', 11 }
        };

        public static bool TryGetBaseNoteAndDelta(
            int step,
            int modulus,
            int baseMidi,
            out int baseNote,
            out double deltaSemitones)
        {
            baseNote = 0;
            deltaSemitones = 0.0;

            if (!SpellingsByModulus.TryGetValue(modulus, out var spellings) || spellings.Length == 0)
            {
                return false;
            }

            var octave = FloorDiv(step, modulus);
            var stepInOctave = Mod(step, modulus);
            if (stepInOctave < 0 || stepInOctave >= spellings.Length)
            {
                return false;
            }

            var spelling = spellings[stepInOctave];
            if (string.IsNullOrEmpty(spelling)) return false;
            var letter = spelling[0];
            if (!NaturalSemitones.TryGetValue(letter, out var naturalSemi)) return false;

            var targetMidi = baseMidi + (step * 12.0 / modulus);
            var accidentals = spelling.Length > 1 ? spelling.Substring(1) : string.Empty;
            var preferUp = accidentals.Contains('#') || accidentals.Contains('+');
            var preferDown = accidentals.Contains('b') || accidentals.Contains('d');
            var baseOffset = Get12EdoAccidentalOffset(accidentals);

            var bestDelta = double.MaxValue;
            var bestNote = 0;

            for (int octaveShift = -1; octaveShift <= 1; octaveShift++)
            {
                var candidateOctave = octave + octaveShift;
                var candidateNote = baseMidi + naturalSemi + baseOffset + (candidateOctave * 12);
                var candidateDelta = targetMidi - candidateNote;
                var abs = Math.Abs(candidateDelta);
                if (abs < Math.Abs(bestDelta))
                {
                    bestDelta = candidateDelta;
                    bestNote = candidateNote;
                    continue;
                }

                if (Math.Abs(abs - Math.Abs(bestDelta)) < 1e-9)
                {
                    if (preferUp && candidateDelta > bestDelta)
                    {
                        bestDelta = candidateDelta;
                        bestNote = candidateNote;
                    }
                    else if (preferDown && candidateDelta < bestDelta)
                    {
                        bestDelta = candidateDelta;
                        bestNote = candidateNote;
                    }
                }
            }

            baseNote = bestNote;
            deltaSemitones = bestDelta;
            return true;
        }

        private static int Get12EdoAccidentalOffset(string accidentals)
        {
            if (string.IsNullOrEmpty(accidentals))
            {
                return 0;
            }

            var offset = 0;
            foreach (var ch in accidentals)
            {
                switch (ch)
                {
                    case '#':
                        offset += 1;
                        break;
                    case 'b':
                        offset -= 1;
                        break;
                }
            }

            return offset;
        }

        private static int FloorDiv(int value, int modulus)
        {
            var q = value / modulus;
            var r = value % modulus;
            if (r != 0 && ((r > 0) != (modulus > 0)))
            {
                q--;
            }
            return q;
        }

        private static int Mod(int value, int modulus)
        {
            return value - FloorDiv(value, modulus) * modulus;
        }
    }
}
