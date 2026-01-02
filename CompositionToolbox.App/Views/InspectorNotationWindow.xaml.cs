using System;
using System.Windows;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;

namespace CompositionToolbox.App.Views
{
    public partial class InspectorNotationWindow : Window
    {
        private AtomicNode? _node;
        private AccidentalRule _rule;
        private string _renderMode = "line";
        private int[]? _midiNotes;
        private bool _useMidiForEdo19;

        public InspectorNotationWindow()
        {
            InitializeComponent();
            Loaded += InspectorNotationWindow_Loaded;
            SizeChanged += (_, _) => Render();
            Closing += InspectorNotationWindow_Closing;
        }

        public void SetNotation(AtomicNode node, AccidentalRule rule, string renderMode, int[]? midiNotes = null, bool useMidiForEdo19 = false)
        {
            _node = node;
            _rule = rule;
            _renderMode = renderMode;
            _midiNotes = midiNotes;
            _useMidiForEdo19 = useMidiForEdo19;
            HeaderText.Text = $"{node.Label} ({_renderMode})";
            Render();
        }

        private void InspectorNotationWindow_Loaded(object? sender, RoutedEventArgs e)
        {
            if (System.Windows.Application.Current is App app && app.AppSettings != null)
            {
                UiPersistenceHelper.ApplyWindowPlacement(this, app.AppSettings, "InspectorNotation");
            }
            Render();
        }

        private void InspectorNotationWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            if (System.Windows.Application.Current is App app && app.AppSettings != null && app.SettingsService != null)
            {
                UiPersistenceHelper.SaveWindowPlacement(this, app.AppSettings, "InspectorNotation");
                app.SettingsService.Save(app.AppSettings);
            }
        }

        private void Render()
        {
            if (_node == null) return;
            var width = Math.Max(0, ExpandedNotation.ActualWidth - 16);
            var height = Math.Max(0, ExpandedNotation.ActualHeight - 16);
            var pcs = _node.Mode == PcMode.Ordered ? _node.Ordered : _node.Unordered;
            var estimatedWidth = Math.Max(width, 40 * Math.Max(1, pcs.Length) + 120);
            var midi = _midiNotes ?? MusicUtils.RealizePcs(pcs, _node.Modulus, _node.Mode, GetRealizationConfig());

            ExpandedNotation.RenderNode(
                _node,
                _rule,
                _renderMode,
                width: width,
                height: height,
                clipToViewport: false,
                showOverflowIndicator: false,
                contentWidth: estimatedWidth,
                allowScroll: true,
                midiNotes: midi,
                useMidiForEdo19: _useMidiForEdo19);
        }

        private static RealizationConfig GetRealizationConfig()
        {
            if (System.Windows.Application.Current is App app && app.AppSettings != null)
            {
                var settings = app.AppSettings;
                return new RealizationConfig
                {
                    Pc0RefMidi = settings.Pc0RefMidi,
                    AmbitusLowMidi = settings.UseAmbitus ? settings.AmbitusLowMidi : null,
                    AmbitusHighMidi = settings.UseAmbitus ? settings.AmbitusHighMidi : null,
                    OrderedUnwrapMode = settings.OrderedUnwrapMode,
                    ChordVoicingMode = settings.ChordVoicingMode,
                    DefaultNotationMode = settings.DefaultNotationMode
                };
            }
            return new RealizationConfig();
        }
    }
}
