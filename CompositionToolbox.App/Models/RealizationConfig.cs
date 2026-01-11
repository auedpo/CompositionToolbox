// Purpose: Domain model that represents the Realization Config data used across the application.

using System;

namespace CompositionToolbox.App.Models
{
    public enum OrderedUnwrapMode
    {
        FixedOctave,
        MinimalLeap,
        AnchorFirst
    }

    public enum ChordVoicingMode
    {
        Closed,
        Spread,
        Centered
    }

    public enum NotationPreference
    {
        Chord,
        Sequence
    }

    public class RealizationConfig
    {
        public int Pc0RefMidi { get; set; } = 60;
        public int? AmbitusLowMidi { get; set; } = 48;
        public int? AmbitusHighMidi { get; set; } = 72;
        public OrderedUnwrapMode OrderedUnwrapMode { get; set; } = OrderedUnwrapMode.MinimalLeap;
        public ChordVoicingMode ChordVoicingMode { get; set; } = ChordVoicingMode.Centered;
        public NotationPreference DefaultNotationMode { get; set; } = NotationPreference.Chord;

        public RealizationConfig Clone()
        {
            return new RealizationConfig
            {
                Pc0RefMidi = Pc0RefMidi,
                AmbitusLowMidi = AmbitusLowMidi,
                AmbitusHighMidi = AmbitusHighMidi,
                OrderedUnwrapMode = OrderedUnwrapMode,
                ChordVoicingMode = ChordVoicingMode,
                DefaultNotationMode = DefaultNotationMode
            };
        }
    }
}
