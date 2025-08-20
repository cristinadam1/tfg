#!/bin/bash
mkdir -p "Canciones_alexa"

for file in /Users/cristinadelaguilamartin/Downloads/Canciones/*.mp3; do

    filename=$(basename -- "$file")
    filename_noext="${filename%.*}"
    
    ffmpeg -i "$file" -ac 2 -codec:a libmp3lame -b:a 48k -ar 24000 -write_xing 0 "Canciones_alexa/${filename_noext}_alexa.mp3"
    
    echo "Procesado: $file -> Canciones_alexa/${filename_noext}_alexa.mp3"
done

echo "¡Procesamiento completado!"