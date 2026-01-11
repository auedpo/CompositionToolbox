// Purpose: Unit tests for the InterferenceRhythmMath service.

using System.Linq;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Services;
using Xunit;

namespace CompositionToolbox.Tests;

public class InterferenceRhythmMathTests
{
    [Fact]
    public void ComputeTwoGenerators_A2_B3()
    {
        var result = InterferenceRhythmMath.ComputeTwoGeneratorResultant(2, 3, pitchA: null, pitchB: null);
        Assert.Equal(6, result.Cycle);
        Assert.Equal(new[] { 0, 2, 3, 4 }, result.Events.Select(e => e.Time));
        Assert.Equal(new[] { 2, 1, 1, 2 }, result.Durations);
    }

    [Fact]
    public void ComputeTwoGenerators_A4_B6()
    {
        var result = InterferenceRhythmMath.ComputeTwoGeneratorResultant(4, 6, null, null);
        Assert.Equal(12, result.Cycle);
        Assert.Equal(new[] { 0, 4, 6, 8 }, result.Events.Select(e => e.Time));
        Assert.Equal(new[] { 4, 2, 2, 4 }, result.Durations);
    }

    [Fact]
    public void ComputeSplitGenerator_A_3_2_B_4()
    {
        var generatorA = new RhythmGeneratorDef("A", new[] { 3, 2 }, null);
        var generatorB = new RhythmGeneratorDef("B", new[] { 4 }, null);
        var result = InterferenceRhythmMath.ComputeResultant(new[] { generatorA, generatorB });

        Assert.Equal(20, result.Cycle);
        Assert.Equal(new[] { 0, 3, 4, 5, 8, 10, 12, 13, 15, 16, 18 }, result.Events.Select(e => e.Time));
        Assert.Equal(11, result.Events.Count);
        Assert.Equal(11, result.Durations.Count);
        Assert.Equal(20, result.Durations.Sum());
    }
}
