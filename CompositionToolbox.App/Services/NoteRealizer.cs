using System;
using System.Collections.Generic;
using System.Linq;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public sealed class NoteRealizer : INoteRealizer
    {
        public IReadOnlyList<RealizedNote> Realize(CompositeSnapshot snap)
        {
            if (snap == null) throw new ArgumentNullException(nameof(snap));

            var pcs = snap.Mode == PcMode.Ordered ? snap.Ordered : snap.Unordered;
            if (pcs.Length == 0) return Array.Empty<RealizedNote>();

            if (snap.Modulus == 12)
            {
                var midi = MusicUtils.RealizePcs(pcs, snap.Modulus, snap.Mode, snap.RealizationConfig);
                return midi.Select(n => new RealizedNote(n, 0)).ToArray();
            }

            var steps = RealizeEdoSteps(pcs, snap.Modulus, snap.Mode, snap.RealizationConfig);
            if (steps.Length == 0) return Array.Empty<RealizedNote>();

            var baseMidi = snap.RealizationConfig?.Pc0RefMidi ?? 60;
            var realized = new List<RealizedNote>(steps.Length);
            foreach (var step in steps)
            {
                var targetMidi = baseMidi + (step * 12.0 / snap.Modulus);
                var baseNote = (int)Math.Round(targetMidi, MidpointRounding.AwayFromZero);
                baseNote = Math.Clamp(baseNote, 0, 127);
                var bend = targetMidi - baseNote;
                realized.Add(new RealizedNote(baseNote, bend));
            }
            return realized;
        }

        private static int[] RealizeEdoSteps(int[] pcs, int modulus, PcMode mode, RealizationConfig config)
        {
            var local = (config ?? new RealizationConfig()).Clone();
            local.Pc0RefMidi = 0;
            local.AmbitusLowMidi = null;
            local.AmbitusHighMidi = null;
            if (local.ChordVoicingMode == ChordVoicingMode.Centered)
            {
                local.ChordVoicingMode = ChordVoicingMode.Closed;
            }
            return MusicUtils.RealizePcs(pcs, modulus, mode, local);
        }
    }
}
