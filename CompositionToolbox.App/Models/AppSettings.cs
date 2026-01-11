// Purpose: Domain model that represents the App Settings data used across the application.

using System;
using System.Collections.Generic;

namespace CompositionToolbox.App.Models
{
    public class AppSettings
    {
        public double WindowWidth { get; set; } = 1100;
        public double WindowHeight { get; set; } = 720;
        public double? WindowLeft { get; set; }
        public double? WindowTop { get; set; }
        public string WindowState { get; set; } = "Normal";
        public double InspectorPanelWidth { get; set; } = 280;
        public Dictionary<string, double> PanelWidths { get; set; } = new Dictionary<string, double>();
        public Dictionary<string, int> PanelOrders { get; set; } = new Dictionary<string, int>();
        public Dictionary<string, WindowPlacementSettings> WindowPlacements { get; set; } = new Dictionary<string, WindowPlacementSettings>();
        public bool IsCompositesPinned { get; set; } = false;
        public int SelectedMidiDeviceIndex { get; set; } = -1;
        public AccidentalRule AccidentalRule { get; set; } = AccidentalRule.NoteAware;
        public string? ProjectPath { get; set; }

        public int Pc0RefMidi { get; set; } = 60;
        public bool UseAmbitus { get; set; } = true;
        public int AmbitusLowMidi { get; set; } = 48;
        public int AmbitusHighMidi { get; set; } = 72;
        public OrderedUnwrapMode OrderedUnwrapMode { get; set; } = OrderedUnwrapMode.MinimalLeap;
        public ChordVoicingMode ChordVoicingMode { get; set; } = ChordVoicingMode.Centered;
        public NotationPreference DefaultNotationMode { get; set; } = NotationPreference.Chord;
        public int PitchBendRangeSemitones { get; set; } = 48;
        public bool SendPitchBendForTuning { get; set; } = true;
        public AppThemeKind Theme { get; set; } = AppThemeKind.DarkNeutral;
    }
}
