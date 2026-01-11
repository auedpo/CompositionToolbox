// Purpose: Tests for divisor-based rhythm grouping helpers.

using CompositionToolbox.App.Utilities;
using Xunit;

namespace CompositionToolbox.Tests;

public class RhythmGroupingTests
{
    [Fact]
    public void GetMeasureDivisors_ReturnsAllDivisors()
    {
        var divisors = RhythmGrouping.GetMeasureDivisors(12);
        Assert.Equal(new[] { 1, 2, 3, 4, 6, 12 }, divisors);
    }

    [Fact]
    public void GetMeasureDivisors_HandlesPrime()
    {
        var divisors = RhythmGrouping.GetMeasureDivisors(7);
        Assert.Equal(new[] { 1, 7 }, divisors);
    }
}
