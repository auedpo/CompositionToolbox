// Purpose: Core code file related to Initialization View Model Tests.

using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using CompositionToolbox.App.Stores;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.Tests;

public class InitializationViewModelTests
{
    [Fact]
    public void ApplyPreset_SetsInputTextToPrimeForm()
    {
        var preset = new PresetPcSet { Id = "4-27", PrimeForm = new[] { 0, 2, 4, 7 }, Cardinality = 4 };
        var vm = new InitializationViewModel(new CompositeStore(), () => 12, new MidiService(), new PresetCatalogService(), new PresetStateService(), () => new RealizationConfig());
        vm.ApplyPreset(preset);
        Assert.Equal("0 2 4 7", vm.InputText);
    }
}