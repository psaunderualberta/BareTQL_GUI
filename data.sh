#!/usr/bin/bash

make_tmp () {
  mkdir -p "data_preprocessing/tmp"
}

db () {
    text=$(find -name output.txt)
    maker=$(find -name makeDB.py)

    cat $text | python $maker
}

txt () {
  converter=$(find -name makeTxt4DB.py)
  python $converter
}
if [ "$1" == "make" ]
then
  make_tmp
  txt
  db
elif [ "$1" == "db" ]
then
  db
elif [ "$1" == "txt" ]
then
  txt
elif [ "$1" == "view" ]
then
  maker=$(find -name makeCSV.py)
  python $maker
else
    printf "Please enter one of the following commands:\n\n"
    printf "./data.sh make:\n\tConvert the csv files at data_preprocessing/input into a sqlite3 database at ./program/server/data/database.db.\n\n"
    printf "./data.sh db:\n\tConvert txt files from data_preprocessing/tmp into a sqlite3 database at ./program/server/data/database.db.\n"
    printf "\t- This is an intermediary step for database creation; 'db' runs only this step in the creation.\n\n"
    printf "./data.sh txt:\n\tCreates the .txt files used in creating the database from .csv files at data_preprocessing/input.py\n"
    printf "\t- This is an intermediary step for database creation; 'txt' runs only this step in the creation.\n\n"
    printf "./data.sh view: \n\tConverts all tables in database.db into .csv files for further analysis. Files will be created at data_preprocessing/csv."
fi
