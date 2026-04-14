from __future__ import annotations

import argparse
from datetime import datetime

ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
SALT = 'MiniHBUT::DailyAccess::2025'


def parse_date(value: str | None) -> datetime:
    if not value:
        return datetime.now()
    return datetime.strptime(value, '%Y-%m-%d')


def get_date_stamp(date: datetime) -> str:
    return date.strftime('%Y%m%d')


def fnv1a(text: str) -> int:
    hash_value = 0x811C9DC5
    for char in text:
        hash_value ^= ord(char)
        hash_value = (hash_value * 0x01000193) & 0xFFFFFFFF
    return hash_value


def encode_chunk(value: int, length: int = 5) -> str:
    current = value & 0xFFFFFFFF
    output = ''
    for _ in range(length):
        output = ALPHABET[current & 31] + output
        current >>= 5
    return output


def generate_daily_access_key(date: datetime) -> str:
    stamp = get_date_stamp(date)
    left = encode_chunk(fnv1a(f'{SALT}:{stamp}:L') ^ 0x13579BDF)
    right = encode_chunk(fnv1a(f'{SALT}:{stamp}:R') ^ 0x2468ACE0)
    return f'{left}-{right}'


def main() -> None:
    parser = argparse.ArgumentParser(description='生成 Mini-HBUT 每日访问秘钥')
    parser.add_argument('--date', help='指定日期，格式为 YYYY-MM-DD；不传则使用今天')
    args = parser.parse_args()
    target_date = parse_date(args.date)
    stamp = get_date_stamp(target_date)
    print(f'date={stamp}')
    print(f'key={generate_daily_access_key(target_date)}')


if __name__ == '__main__':
    main()
