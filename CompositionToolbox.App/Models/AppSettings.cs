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
        public double PresetPickerWidth { get; set; } = 900;
        public double PresetPickerHeight { get; set; } = 600;
        public double? PresetPickerLeft { get; set; }
        public double? PresetPickerTop { get; set; }
        public double PresetPickerFilterWidth { get; set; } = 180;
        public double PresetPickerPreviewWidth { get; set; } = 340;
        public double[] PresetPickerColumnWidths { get; set; } = new[] { 320d, 40d, 40d, 40d };
        public Dictionary<string, double> PresetPickerColumnWidthMap { get; set; } = new Dictionary<string, double>();
        public string[] PresetPickerColumnOrder { get; set; } = Array.Empty<string>();
        public int PresetPickerSelectedCardinality { get; set; } = -1;
        public bool PresetPickerShowFavoritesOnly { get; set; }
        public double InspectorPanelWidth { get; set; } = 280;
        public Dictionary<string, double> PanelWidths { get; set; } = new Dictionary<string, double>();
        public Dictionary<string, WindowPlacementSettings> WindowPlacements { get; set; } = new Dictionary<string, WindowPlacementSettings>();
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
    }
}
