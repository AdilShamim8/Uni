"""Add your own tool in ~10 lines.

Run: python examples/custom_tool.py  → starts ReWoo with a new "weather_joke" tool
that every helper with no tool restriction (e.g. Woo) can use.
"""
import uvicorn

from rewoo.api.app import create_app
from rewoo.core import ReWoo
from rewoo.tools.registry import ToolResult

rw = ReWoo()


@rw.tools.tool("weather_joke", "Tell a light joke about the weather in a city.", {"city": "city name"},
               risk="safe", label="Thinking of a weather joke", emoji="⛅")
async def weather_joke(ctx, city: str = "", **_):
    return ToolResult(f"weather_joke: In {city}, even the clouds need a vacation.", {"city": city})


if __name__ == "__main__":
    uvicorn.run(create_app(rw), host="127.0.0.1", port=8787)
