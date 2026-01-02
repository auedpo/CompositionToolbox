using System;
using System.Windows;
using System.Windows.Threading;
using CompositionToolbox.App.ViewModels;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using System.Runtime.CompilerServices;

namespace CompositionToolbox.App.Views.Behaviors
{
    public static class ListViewLazyVmLoader
    {
        public static readonly DependencyProperty EnableLazyVmLoadingProperty =
            DependencyProperty.RegisterAttached("EnableLazyVmLoading", typeof(bool), typeof(ListViewLazyVmLoader), new PropertyMetadata(false, OnEnableChanged));

        public static void SetEnableLazyVmLoading(DependencyObject element, bool value) => element.SetValue(EnableLazyVmLoadingProperty, value);
        public static bool GetEnableLazyVmLoading(DependencyObject element) => (bool)element.GetValue(EnableLazyVmLoadingProperty);

        private static void OnEnableChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        {
            if (d is System.Windows.Controls.ListView list)
            {
                if ((bool)e.NewValue)
                {
                    list.ItemContainerGenerator.StatusChanged += (s, _) => OnStatusChanged(list);
                    list.ItemContainerGenerator.ItemsChanged += (s, _) => OnStatusChanged(list);
                    list.LayoutUpdated += List_LayoutUpdated;
                }
                else
                {
                    try
                    {
                        list.ItemContainerGenerator.StatusChanged -= (s, _) => OnStatusChanged(list);
                        list.ItemContainerGenerator.ItemsChanged -= (s, _) => OnStatusChanged(list);
                        list.LayoutUpdated -= List_LayoutUpdated;
                    }
                    catch { }
                }
            }
        }

        private static readonly ConditionalWeakTable<System.Windows.Controls.ListView, object> _pending = new();

        private static void List_LayoutUpdated(object? sender, EventArgs e)
        {
            if (sender is System.Windows.Controls.ListView list)
            {
                ScheduleScan(list);
            }
        }

        private static void OnStatusChanged(System.Windows.Controls.ListView list)
        {
            ScheduleScan(list);
        }

        private static void ScheduleScan(System.Windows.Controls.ListView list)
        {
            if (list == null) return;
            // Avoid stacking multiple scans
            if (_pending.TryGetValue(list, out _)) return;
            _pending.Add(list, null!);
            list.Dispatcher.BeginInvoke(new Action(() =>
            {
                try
                {
                    _pending.Remove(list);
                    ScanForRealizedContainers(list);
                }
                catch (Exception ex)
                {
                    TimingLogger.Log($"ListViewLazyVmLoader: Scan failed: {ex.Message}");
                }
            }), DispatcherPriority.Background);
        }

        private static void ScanForRealizedContainers(System.Windows.Controls.ListView list)
        {
            try
            {
                var gen = list.ItemContainerGenerator;
                for (int i = 0; i < list.Items.Count; i++)
                {
                    var container = gen.ContainerFromIndex(i) as System.Windows.Controls.ListViewItem;
                    if (container == null) break; // containers are contiguous from top
                    var item = container.Content;
                    if (item is PresetPcSet model)
                    {
                        TimingLogger.Log($"ListViewLazyVmLoader: Realized idx={i} id={model.Id}");
                        var window = Window.GetWindow(list);
                        if (window?.DataContext is PresetPickerViewModel vm)
                        {
                            vm.EnsureMaterialized(model, i);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                TimingLogger.Log($"ListViewLazyVmLoader: ScanForRealizedContainers error: {ex.Message}");
            }
        }
    }
}