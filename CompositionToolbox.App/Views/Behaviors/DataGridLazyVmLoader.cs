// Purpose: Attached behavior providing reusable Data Grid Lazy Vm Loader helpers for XAML controls.

using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using CompositionToolbox.App.ViewModels;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;

namespace CompositionToolbox.App.Views.Behaviors
{
    public static class DataGridLazyVmLoader
    {
        public static readonly DependencyProperty EnableLazyVmLoadingProperty =
            DependencyProperty.RegisterAttached("EnableLazyVmLoading", typeof(bool), typeof(DataGridLazyVmLoader), new PropertyMetadata(false, OnEnableChanged));

        public static void SetEnableLazyVmLoading(DependencyObject element, bool value) => element.SetValue(EnableLazyVmLoadingProperty, value);
        public static bool GetEnableLazyVmLoading(DependencyObject element) => (bool)element.GetValue(EnableLazyVmLoadingProperty);

        private static void OnEnableChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        {
            if (d is DataGrid grid)
            {
                if ((bool)e.NewValue)
                {
                    grid.LoadingRow += Grid_LoadingRow;
                }
                else
                {
                    grid.LoadingRow -= Grid_LoadingRow;
                }
            }
        }

        private static void Grid_LoadingRow(object? sender, DataGridRowEventArgs e)
        {
            try
            {
                var row = e.Row;
                TimingLogger.Log($"DataGridLazyVmLoader: LoadingRow idx={row.GetIndex()} itemType={row.Item?.GetType().Name}");
                // Schedule materialization at background priority so UI completes render first
                row.Dispatcher.BeginInvoke(new Action(() => HandleRowLoaded(row)), DispatcherPriority.Background);
            }
            catch (Exception ex)
            {
                TimingLogger.Log($"DataGridLazyVmLoader: LoadingRow failed: {ex.Message}");
            }
        }

        private static void HandleRowLoaded(DataGridRow row)
        {
            if (row == null) return;
            var item = row.Item;
            if (item is PresetPcSet model)
            {
                // Find the ViewModel on DataContext (window.DataContext)
                var window = Window.GetWindow(row);
                if (window?.DataContext is PitchListCatalogViewModel vm)
                {
                    try
                    {
                        var index = row.GetIndex();
                        vm.EnsureMaterialized(model, index);
                    }
                    catch (Exception ex)
                    {
                        TimingLogger.Log($"DataGridLazyVmLoader: EnsureMaterialized failed: {ex.Message}");
                    }
                }
            }
        }
    }
}