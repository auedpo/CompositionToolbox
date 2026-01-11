// Purpose: Midi Monitor view model that exposes state and commands for its associated view.

using System;
using System.Collections.ObjectModel;
using System.Windows;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.ViewModels
{
    public sealed class MidiMonitorViewModel
    {
        public ObservableCollection<MidiMonitorMessage> Messages { get; } = new ObservableCollection<MidiMonitorMessage>();

        public void AddMessage(MidiMonitorMessage message)
        {
            if (message == null) return;
            var dispatcher = System.Windows.Application.Current?.Dispatcher;
            if (dispatcher == null || dispatcher.CheckAccess())
            {
                Messages.Add(message);
            }
            else
            {
                dispatcher.Invoke(() => Messages.Add(message));
            }
        }

        public void Clear()
        {
            var dispatcher = System.Windows.Application.Current?.Dispatcher;
            if (dispatcher == null || dispatcher.CheckAccess())
            {
                Messages.Clear();
            }
            else
            {
                dispatcher.Invoke(() => Messages.Clear());
            }
        }
    }
}
