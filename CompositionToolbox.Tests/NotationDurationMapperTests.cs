// Purpose: Tests for mapping duration units into dotted/tied notation segments.

using System.Linq;
using CompositionToolbox.App.Utilities;
using Xunit;

namespace CompositionToolbox.Tests;

public class NotationDurationMapperTests
{
    [Fact]
    public void BuildDurationSegments_QuarterBase_ThreeUnits_IsDottedHalf()
    {
        var segments = NotationDurationMapper.BuildDurationSegments(3, "1/4").ToArray();
        Assert.Single(segments);
        Assert.Equal("h", segments[0].Duration);
        Assert.Equal(1, segments[0].Dots);
    }

    [Fact]
    public void BuildDurationSegments_QuarterBase_FiveUnits_IsWholePlusQuarter()
    {
        var segments = NotationDurationMapper.BuildDurationSegments(5, "1/4").ToArray();
        Assert.Equal(2, segments.Length);
        Assert.Equal("w", segments[0].Duration);
        Assert.Equal("q", segments[1].Duration);
    }

    [Fact]
    public void BuildDurationSegments_EighthBase_ThreeUnits_IsDottedQuarter()
    {
        var segments = NotationDurationMapper.BuildDurationSegments(3, "1/8").ToArray();
        Assert.Single(segments);
        Assert.Equal("q", segments[0].Duration);
        Assert.Equal(1, segments[0].Dots);
    }
}
