using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using CompositionToolbox.App.ViewModels;
using WpfBinding = System.Windows.Data.Binding;

namespace CompositionToolbox.App.Views
{
    public partial class AcdlLensView : System.Windows.Controls.UserControl
    {
        private AcdlLensViewModel? _viewModel;

        public AcdlLensView()
        {
            InitializeComponent();
            DataContextChanged += OnDataContextChanged;
        }

        private void ResultsGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (DataContext is AcdlLensViewModel vm && vm.CommitSelectedCommand.CanExecute(null))
            {
                vm.CommitSelectedCommand.Execute(null);
            }
        }

        private void ResultsGrid_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
        {
            if (e.Key == Key.Enter && DataContext is AcdlLensViewModel vm && vm.CommitSelectedCommand.CanExecute(null))
            {
                vm.CommitSelectedCommand.Execute(null);
                e.Handled = true;
            }
        }

        private void ResultsGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (DataContext is AcdlLensViewModel vm)
            {
                vm.SelectedMultiAnchorIndex = null;
                vm.SelectedMultiP = null;
            }
        }

        private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
        {
            if (_viewModel != null)
            {
                _viewModel.PropertyChanged -= OnViewModelPropertyChanged;
            }

            _viewModel = DataContext as AcdlLensViewModel;
            if (_viewModel != null)
            {
                _viewModel.PropertyChanged += OnViewModelPropertyChanged;
                BuildMultiColumns(_viewModel.MultiPValues);
            }
            else
            {
                BuildMultiColumns(Array.Empty<int>());
            }
        }

        private void MultiResultsGrid_SelectedCellsChanged(object sender, SelectedCellsChangedEventArgs e)
        {
            if (DataContext is not AcdlLensViewModel vm) return;

            var cellInfo = MultiResultsGrid.SelectedCells.FirstOrDefault();
            if (cellInfo.Item is not AcdlMultiResultRow row)
            {
                vm.SelectedMultiAnchorIndex = null;
                vm.SelectedMultiP = null;
                return;
            }

            if (!TryGetPFromColumn(cellInfo.Column, out var p))
            {
                vm.SelectedMultiAnchorIndex = row.AnchorGapIndex;
                vm.SelectedMultiP = null;
                return;
            }

            vm.SelectedMultiAnchorIndex = row.AnchorGapIndex;
            vm.SelectedMultiP = p;
        }

        private void MultiResultsGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (DataContext is not AcdlLensViewModel vm) return;

            if (!TryGetCellInfo(e.OriginalSource as DependencyObject, out var row, out var p))
            {
                return;
            }

            vm.SelectedMultiAnchorIndex = row.AnchorGapIndex;
            vm.SelectedMultiP = p;

            if (vm.CommitSelectedCommand.CanExecute(null))
            {
                vm.CommitSelectedCommand.Execute(null);
            }
        }

        private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(AcdlLensViewModel.MultiPValues) && sender is AcdlLensViewModel vm)
            {
                BuildMultiColumns(vm.MultiPValues);
            }
        }

        private void BuildMultiColumns(IReadOnlyList<int> pValues)
        {
            if (MultiResultsGrid == null) return;

            MultiResultsGrid.Columns.Clear();
            var anchorColumn = new DataGridTextColumn
            {
                Header = "Anchor",
                Binding = new WpfBinding(nameof(AcdlMultiResultRow.AnchorGapIndex)),
                Width = 70
            };
            MultiResultsGrid.Columns.Add(anchorColumn);

            if (pValues == null) return;

            var monoStyle = TryFindResource("AcdlMonoText") as Style;
            foreach (var p in pValues)
            {
                var column = new DataGridTextColumn
                {
                    Header = $"P={p}",
                    Binding = new WpfBinding($"[{p}]"),
                    Width = new DataGridLength(1, DataGridLengthUnitType.Star),
                    ElementStyle = monoStyle
                };
                MultiResultsGrid.Columns.Add(column);
            }
        }

        private static bool TryGetPFromColumn(DataGridColumn? column, out int p)
        {
            p = 0;
            if (column?.Header is null) return false;
            var header = column.Header.ToString();
            if (string.IsNullOrWhiteSpace(header)) return false;
            if (header.StartsWith("P=", StringComparison.OrdinalIgnoreCase))
            {
                header = header.Substring(2).Trim();
            }
            return int.TryParse(header, out p);
        }

        private static bool TryGetCellInfo(DependencyObject? source, out AcdlMultiResultRow row, out int p)
        {
            row = null!;
            p = 0;
            if (source == null) return false;

            var cell = FindAncestor<DataGridCell>(source);
            if (cell == null) return false;

            if (!TryGetPFromColumn(cell.Column, out p))
            {
                return false;
            }

            if (cell.DataContext is not AcdlMultiResultRow dataRow)
            {
                return false;
            }

            row = dataRow;
            return true;
        }

        private static T? FindAncestor<T>(DependencyObject? source) where T : DependencyObject
        {
            var current = source;
            while (current != null)
            {
                if (current is T match) return match;
                current = VisualTreeHelper.GetParent(current);
            }
            return null;
        }
    }
}
