#!/bin/sh

git st --porcelain | grep -E '^(A|M)' | cut -d" " -f3 | grep -E "\\.js\$" | xargs -n1 jslint
