// Purpose: Code-behind for the Midi Monitor Window view that wires inputs into its view model.

using System;
using System.Windows;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Views
{
    public partial class MidiMonitorWindow : Window
    {
        private readonly MidiService _midiService;
        private readonly MidiMonitorViewModel _vm;

        public MidiMonitorWindow(MidiService midiService)
        {
            InitializeComponent();
            _midiService = midiService ?? throw new ArgumentNullException(nameof(midiService));
            _vm = new MidiMonitorViewModel();
            DataContext = _vm;
            _midiService.MidiMessageSent += MidiService_MidiMessageSent;
        }

        public void ClearMessages()
        {
            _vm.Clear();
        }

        private void MidiService_MidiMessageSent(object? sender, MidiMonitorMessage e)
        {
            _vm.AddMessage(e);
        }

        private void Clear_Click(object sender, RoutedEventArgs e)
        {
            _vm.Clear();
        }

        protected override void OnClosed(EventArgs e)
        {
            _midiService.MidiMessageSent -= MidiService_MidiMessageSent;
            base.OnClosed(e);
        }
    }
}
