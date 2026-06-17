from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split


FEATURE_COLUMNS = [
    "open",
    "high",
    "low",
    "close",
    "volume",
    "rsi",
    "macd",
    "ema",
    "sma",
    "sector_performance",
]


@dataclass
class TrainingResult:
    model_path: str
    mae: float
    rows: int


def train_next_day_model(csv_path: str, model_output_path: str) -> TrainingResult:
    dataset = pd.read_csv(csv_path)
    missing = [column for column in FEATURE_COLUMNS + ["target_next_day_price"] if column not in dataset.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    dataset = dataset.dropna(subset=FEATURE_COLUMNS + ["target_next_day_price"])
    x = dataset[FEATURE_COLUMNS]
    y = dataset["target_next_day_price"]

    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)

    model = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1)
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    mae = mean_absolute_error(y_test, predictions)

    output = Path(model_output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURE_COLUMNS}, output)

    return TrainingResult(model_path=str(output), mae=float(mae), rows=int(len(dataset)))

