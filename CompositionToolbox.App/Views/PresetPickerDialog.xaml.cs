using System;
using System.ComponentModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Views
{
    public partial class PresetPickerDialog : Window
    {
        private PresetPickerViewModel? _vm;
        private SettingsService? _settingsService;
        private AppSettings? _appSettings;

        public PresetPickerDialog()
        {
            InitializeComponent();
            Loaded += PresetPickerDialog_Loaded;
            DataContextChanged += PresetPickerDialog_DataContextChanged;
            Closing += PresetPickerDialog_Closing;
            PreviewNotation.SizeChanged += PreviewNotation_SizeChanged;
        }

        public void Initialize(SettingsService settingsService, AppSettings appSettings)
        {
            _settingsService = settingsService;
            _appSettings = appSettings;
            ApplyWindowSettings();
            ApplyColumnLayout();
            ApplyFilterSettings();
        }

        private void PresetPickerDialog_Loaded(object sender, RoutedEventArgs e)
        {
            SearchBox.Focus();
            SearchBox.SelectionStart = SearchBox.Text.Length;
        }

        private void PresetPickerDialog_DataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
        {
            if (_vm != null)
            {
                _vm.PropertyChanged -= Vm_PropertyChanged;
            }

            _vm = DataContext as PresetPickerViewModel;
            if (_vm != null)
            {
                _vm.PropertyChanged += Vm_PropertyChanged;
            }

            RenderNotation();
        }

        private void Vm_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(PresetPickerViewModel.PreviewNode)
                || e.PropertyName == nameof(PresetPickerViewModel.NotationRenderMode)
                || e.PropertyName == nameof(PresetPickerViewModel.AccidentalRule)
                || e.PropertyName == nameof(PresetPickerViewModel.PreviewMidiNotes))
            {
                RenderNotation();
            }
        }

        private void RenderNotation()
        {
            if (_vm == null) return;
            var width = Math.Max(0, PreviewNotation.ActualWidth - 16);
            var height = Math.Max(0, PreviewNotation.ActualHeight - 16);
            if (width <= 0 || height <= 0) return;
            PreviewNotation.RenderNode(
                _vm.PreviewNode,
                _vm.AccidentalRule,
                _vm.NotationRenderMode,
                width: width,
                height: height,
                maxNotes: 16,
                clipToViewport: true,
                showOverflowIndicator: true,
                midiNotes: _vm.PreviewMidiNotes);
        }

        private void PreviewNotation_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            RenderNotation();
        }

        private void SearchBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (_vm == null) return;
            if (e.Key == Key.Down)
            {
                MoveSelection(1);
                e.Handled = true;
            }
            else if (e.Key == Key.Up)
            {
                MoveSelection(-1);
                e.Handled = true;
            }
            else if (e.Key == Key.Enter)
            {
                if (_vm.ApplySelected())
                {
                    Close();
                }
                e.Handled = true;
            }
            else if (e.Key == Key.Escape)
            {
                Close();
                e.Handled = true;
            }
        }

        private void MoveSelection(int delta)
        {
            if (ResultsList.Items.Count == 0) return;
            var index = ResultsList.SelectedIndex;
            if (index < 0) index = 0;
            index = Math.Clamp(index + delta, 0, ResultsList.Items.Count - 1);
            ResultsList.SelectedIndex = index;
            ResultsList.ScrollIntoView(ResultsList.SelectedItem);
        }

        private void ResultsList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (_vm != null && _vm.ApplySelected())
            {
                Close();
            }
        }

        private void ResultsList_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            SearchBox.Focus();
        }

        private void CardinalityList_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            FocusSearchBox();
        }

        private void FavoritesOnly_Checked(object sender, RoutedEventArgs e)
        {
            FocusSearchBox();
        }

        private void FocusSearchBox()
        {
            SearchBox.Focus();
        }

        private void ResultsHeader_Click(object sender, RoutedEventArgs e)
        {
            if (_vm == null) return;
            if (e.OriginalSource is GridViewColumnHeader header && header.Column != null)
            {
                var name = header.Column.Header?.ToString();
                _vm.SetSort(name);
                FocusSearchBox();
            }
        }

        private void PresetPickerDialog_Closing(object? sender, CancelEventArgs e)
        {
            SaveWindowSettings();
        }

        private void ApplyWindowSettings()
        {
            if (_appSettings == null) return;
            var applied = UiPersistenceHelper.ApplyWindowPlacement(this, _appSettings, "PresetPicker");
            if (!applied)
            {
                if (_appSettings.PresetPickerWidth > 0) Width = _appSettings.PresetPickerWidth;
                if (_appSettings.PresetPickerHeight > 0) Height = _appSettings.PresetPickerHeight;
                if (_appSettings.PresetPickerLeft.HasValue && _appSettings.PresetPickerTop.HasValue)
                {
                    WindowStartupLocation = WindowStartupLocation.Manual;
                    Left = _appSettings.PresetPickerLeft.Value;
                    Top = _appSettings.PresetPickerTop.Value;
                }
            }
            if (_appSettings.PresetPickerFilterWidth > 0)
            {
                FilterColumn.Width = new GridLength(_appSettings.PresetPickerFilterWidth);
            }
            if (_appSettings.PresetPickerPreviewWidth > 0)
            {
                PreviewColumn.Width = new GridLength(_appSettings.PresetPickerPreviewWidth);
            }
            if (_appSettings.PanelWidths.TryGetValue("PresetPicker.Filter", out var filterWidth) && filterWidth > 0)
            {
                FilterColumn.Width = new GridLength(filterWidth);
            }
            if (_appSettings.PanelWidths.TryGetValue("PresetPicker.Preview", out var previewWidth) && previewWidth > 0)
            {
                PreviewColumn.Width = new GridLength(previewWidth);
            }
        }

        private void ApplyColumnLayout()
        {
            if (_appSettings == null) return;
            if (ResultsList.View is not GridView view) return;

            if (_appSettings.PresetPickerColumnOrder != null && _appSettings.PresetPickerColumnOrder.Length > 0)
            {
                var byHeader = view.Columns.ToDictionary(c => ColumnKey(c), c => c, StringComparer.OrdinalIgnoreCase);
                view.Columns.Clear();
                foreach (var key in _appSettings.PresetPickerColumnOrder)
                {
                    if (byHeader.TryGetValue(key, out var column))
                    {
                        view.Columns.Add(column);
                        byHeader.Remove(key);
                    }
                }
                foreach (var leftover in byHeader.Values)
                {
                    view.Columns.Add(leftover);
                }
            }

            if (_appSettings.PresetPickerColumnWidthMap != null && _appSettings.PresetPickerColumnWidthMap.Count > 0)
            {
                foreach (var column in view.Columns)
                {
                    var key = ColumnKey(column);
                    if (_appSettings.PresetPickerColumnWidthMap.TryGetValue(key, out var width) && width > 0 && !double.IsNaN(width))
                    {
                        column.Width = width;
                    }
                }
                return;
            }

            if (_appSettings.PresetPickerColumnWidths == null) return;
            var widths = _appSettings.PresetPickerColumnWidths;
            if (widths.Length != view.Columns.Count) return;
            for (int i = 0; i < widths.Length; i++)
            {
                if (widths[i] > 0 && !double.IsNaN(widths[i]))
                {
                    view.Columns[i].Width = widths[i];
                }
            }
        }

        private void SaveWindowSettings()
        {
            if (_settingsService == null || _appSettings == null) return;
            UiPersistenceHelper.SaveWindowPlacement(this, _appSettings, "PresetPicker");
            var bounds = WindowState == WindowState.Normal ? new Rect(Left, Top, Width, Height) : RestoreBounds;
            _appSettings.PresetPickerWidth = bounds.Width;
            _appSettings.PresetPickerHeight = bounds.Height;
            _appSettings.PresetPickerLeft = bounds.Left;
            _appSettings.PresetPickerTop = bounds.Top;
            _appSettings.PresetPickerFilterWidth = FilterColumn.ActualWidth;
            _appSettings.PresetPickerPreviewWidth = PreviewColumn.ActualWidth;
            _appSettings.PanelWidths["PresetPicker.Filter"] = FilterColumn.ActualWidth;
            _appSettings.PanelWidths["PresetPicker.Preview"] = PreviewColumn.ActualWidth;

            if (ResultsList.View is GridView view)
            {
                _appSettings.PresetPickerColumnWidths = view.Columns.Select(c => c.Width).ToArray();
                _appSettings.PresetPickerColumnWidthMap = view.Columns.ToDictionary(c => ColumnKey(c), c => c.Width, StringComparer.OrdinalIgnoreCase);
                _appSettings.PresetPickerColumnOrder = view.Columns.Select(ColumnKey).ToArray();
            }

            if (_vm != null)
            {
                _appSettings.PresetPickerSelectedCardinality = _vm.SelectedCardinality ?? -1;
                _appSettings.PresetPickerShowFavoritesOnly = _vm.ShowFavoritesOnly;
            }

            _settingsService.Save(_appSettings);
        }

        private static string ColumnKey(GridViewColumn column)
        {
            return column.Header?.ToString() ?? string.Empty;
        }

        private void ApplyFilterSettings()
        {
            if (_vm == null || _appSettings == null) return;
            _vm.SelectedCardinality = _appSettings.PresetPickerSelectedCardinality > 0
                ? _appSettings.PresetPickerSelectedCardinality
                : null;
            _vm.ShowFavoritesOnly = _appSettings.PresetPickerShowFavoritesOnly;
        }
    }
}
