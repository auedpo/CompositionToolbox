using System.Collections.Specialized;
using System.Windows;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Views
{
    public partial class SwirlingMistsLensView : System.Windows.Controls.UserControl
    {
        private SwirlingMistsLensViewModel? _viewModel;

        public SwirlingMistsLensView()
        {
            InitializeComponent();
            DataContextChanged += OnDataContextChanged;
        }

        private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
        {
            if (_viewModel != null)
            {
                _viewModel.Strata.CollectionChanged -= Strata_CollectionChanged;
            }

            _viewModel = DataContext as SwirlingMistsLensViewModel;
            if (_viewModel != null)
            {
                _viewModel.Strata.CollectionChanged += Strata_CollectionChanged;
            }

            RebuildColumns();
        }

        private void Strata_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        {
            RebuildColumns();
        }

        private void RebuildColumns()
        {
            if (ExtractionGrid == null) return;

            ExtractionGrid.Columns.Clear();
            ExtractionGrid.Columns.Add(new System.Windows.Controls.DataGridTextColumn
            {
                Header = "#",
                Binding = new System.Windows.Data.Binding(nameof(SwirlingMistsSnapshotRow.Index))
            });
            ExtractionGrid.Columns.Add(new System.Windows.Controls.DataGridTextColumn
            {
                Header = "x",
                Binding = new System.Windows.Data.Binding(nameof(SwirlingMistsSnapshotRow.X)) { StringFormat = "0.###" }
            });
            ExtractionGrid.Columns.Add(new System.Windows.Controls.DataGridTextColumn
            {
                Header = "t",
                Binding = new System.Windows.Data.Binding(nameof(SwirlingMistsSnapshotRow.T)) { StringFormat = "0.###" }
            });

            if (_viewModel == null) return;
            for (var i = 0; i < _viewModel.Strata.Count; i++)
            {
                ExtractionGrid.Columns.Add(new System.Windows.Controls.DataGridTextColumn
                {
                    Header = $"S{i + 1}",
                    Binding = new System.Windows.Data.Binding($"Values[{i}]") { StringFormat = "0.###" }
                });
            }
        }
    }
}
