import pytest

from app.services.renderer import _parse_edit_plan


def test_parses_valid_scene_plan():
    plan = _parse_edit_plan(
        '{"title":"A short","clips":[{"start":0,"end":20},{"start":30,"end":50},{"start":60,"end":80}],"voiceover":"' + ("A factual narration sentence. " * 5) + '"}',
        100,
    )
    assert plan["title"] == "A short"
    assert len(plan["clips"]) == 3


def test_rejects_scene_plan_outside_source_duration():
    with pytest.raises(ValueError):
        _parse_edit_plan(
            '{"clips":[{"start":0,"end":20},{"start":30,"end":50},{"start":60,"end":120}],"voiceover":"' + ("Narration words. " * 8) + '"}',
            100,
        )


def test_rejects_too_short_selected_footage():
    with pytest.raises(ValueError):
        _parse_edit_plan(
            '{"clips":[{"start":0,"end":5},{"start":10,"end":15},{"start":20,"end":25}],"voiceover":"' + ("Narration words. " * 8) + '"}',
            100,
        )
