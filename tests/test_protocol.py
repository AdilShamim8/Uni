"""Portable JSON action protocol: forgiving parsing + citation extraction."""
from __future__ import annotations

import pytest

from rewoo.agent.protocol import Action, ProtocolError, cited_numbers, parse_action


def test_parse_action_plain_tool_call():
    action = parse_action('{"thought": "let\'s search", "tool": "search_memory", "input": {"query": "rent"}}')
    assert action.tool == "search_memory"
    assert action.input == {"query": "rent"}
    assert action.answer is None


def test_parse_action_plain_answer():
    action = parse_action('{"thought": "done", "answer": "The rent is 42,000 [1]."}')
    assert action.answer == "The rent is 42,000 [1]."
    assert action.tool == ""


def test_parse_action_handles_code_fences():
    text = '```json\n{"thought": "ok", "answer": "hi"}\n```'
    action = parse_action(text)
    assert action.answer == "hi"


def test_parse_action_handles_surrounding_chatter():
    text = 'Sure, here you go:\n{"thought": "ok", "tool": "calculator", "input": {"expression": "1+1"}}\nLet me know!'
    action = parse_action(text)
    assert action.tool == "calculator"
    assert action.input == {"expression": "1+1"}


def test_parse_action_handles_trailing_commas():
    text = '{"thought": "ok", "tool": "calculator", "input": {"expression": "1+1",},}'
    action = parse_action(text)
    assert action.tool == "calculator"
    assert action.input == {"expression": "1+1"}


def test_parse_action_final_alias():
    action = parse_action('{"thought": "done", "final": "the answer is 42"}')
    assert action.answer == "the answer is 42"


def test_parse_action_action_alias_for_tool():
    action = parse_action('{"thought": "ok", "action": "calculator", "input": {"expression": "1+1"}}')
    assert action.tool == "calculator"


def test_parse_action_raises_on_garbage():
    with pytest.raises(ProtocolError):
        parse_action("this is not json at all, just chatter")


def test_parse_action_raises_when_no_tool_or_answer():
    with pytest.raises(ProtocolError):
        parse_action('{"thought": "hmm"}')


def test_parse_action_non_dict_input_is_wrapped():
    action = parse_action('{"thought": "ok", "tool": "search_memory", "input": "rent"}')
    assert action.input == {"query": "rent"}


def test_cited_numbers_extracts_and_dedupes_sorted():
    assert cited_numbers("See [3] and [1], also [3] again and [10].") == [1, 3, 10]


def test_cited_numbers_empty_when_none():
    assert cited_numbers("no citations here") == []


def test_action_normalized_round_trip_tool():
    action = Action(thought="hi", tool="calculator", input={"expression": "1+1"})
    normalized = action.normalized()
    assert '"tool": "calculator"' in normalized
    reparsed = parse_action(normalized)
    assert reparsed.tool == "calculator"
    assert reparsed.input == {"expression": "1+1"}


def test_action_normalized_round_trip_answer():
    action = Action(thought="hi", answer="done")
    normalized = action.normalized()
    reparsed = parse_action(normalized)
    assert reparsed.answer == "done"
