import json
import sys
import string
import re
import itertools
import operator

punct_chars = string.punctuation + "– –"

"""
Originally from Thomas LaFontaine's original BareTQL repository. 

"""

'''
Function that determines whether a column is valid. A column is not valid if
it is empty, has an average length longer than 40 characters, all its 
entries are punctuation or if the same entry is repeated every time.

Arguments:
    column: Column to be determined if it is valid
Returns:
    True if column is valid and False otherwise.
'''
def is_valid_col(column):
    if (not is_empty_col(column) and 
        is_appropriate_size(column) and 
        not is_punctuation_col(column) and 
        not is_same_col(column)):
        return True
    else:
        return False

'''
Function used to determine whether a column is empty.

Arguments:
    column: Column to be determined if it is empty
Returns:
    True if column is empty and False otherwise.
'''
def is_empty_col(column):
    threshold = 0.8
    count = 0
    length = len(column)
    for i in range(length):
        if column[i] == "":
            count += 1
    if length == 0 or (count / length) > threshold:
        return True
    else:
        return False

'''
Function used to determine whether a column is appropriate size.

Arguments:
    column: Column to be determined if it is appropriate size
Returns:
    True if column is appropriate size and False otherwise.
'''
def is_appropriate_size(column):
    length = len(column)
    size = 0
    for i in range(length):
        size += len(column[i])
    if length > 0 and size / length > 40:
        return False
    else:
        return True

'''
Function used to determine whether a column has the same entry for
all its entries.

Arguments:
    column: Column to be determined if it has the same entries for all rows
Returns:
    True if column is has the same entries for all rows and False otherwise.
'''
def is_same_col(column):
    entries = set(column)
    if len(entries) == 1:
        return True
    else:
        return False

'''
Function used to determine whether every entry in a column is punctuation

Arguments:
    column: Column to be determined if it is all punctuation
Returns:
    True if column is all punctuation and False otherwise.
'''
def is_punctuation_col(column):
    is_punctuation_col = True
    for entry in column:
        if not is_punctuation(entry):
            is_punctuation_col = False
            break
    return is_punctuation_col

'''
Function used to determine whether a string is all punctuation.

Arguments:
    entry: String to be determined if it is all punctuation
Returns:
    True if entry is all punctuation and False otherwise.
'''
def is_punctuation(entry):
    is_punctuation = True
    for c in entry:
        if c not in punct_chars:
            is_punctuation = False
            break
    return is_punctuation

'''
Function that validates the key column. A key column is valid
if it is not the row index for the row, is textual, all entries
are unique and there at least 3 entries that do not have any
punctuation characters (excluding ,.-)

Arguments:
    columns: Columns in the data table
'''
def validate_key_col(valid_cols):
    if len(valid_cols) > 0:
        key_col = valid_cols[0]
        # Determine whether key column is valid
        if is_increment(key_col):
            valid_cols.remove(key_col)
        switch_key_col(valid_cols)

'''
Function that determines whether the key column is incremental.

Arguments:
    key_col: Key column

Returns:
    True if the key column is incremental and False otherwise.
'''
def is_increment(key_col):
    increment = True
    try:
        start = int(key_col[0].strip(punct_chars))
        for i in range(1, len(key_col)):
            if (not is_punctuation(key_col[i]) and 
                key_col[i].strip(punct_chars) != str(start + i)):
                increment = False
                break
        return increment
    except ValueError:
        return False 

'''
Function that switches the key column for a table if the current key
column is not textual, unique or does not have more than 3 rows that
have no punctuation other than ,.-.
Deletes the table if there are no suitable key columns.

Arguments:
    cols: The columns of a data table
'''
def switch_key_col(cols):
    if len(cols) > 0:
        key_col = cols[0] 
        tag = tag_unit_for_column(key_col)
        # Determine whther current key column is valid
        if ((tag == "numeric") or 
            (tag == "date") or  
            (tag == "text" and is_punct_int_col(key_col)) or 
            not unique_key(key_col) or 
            not min_punct_col(key_col)):
            # If the current key column is not valid, iterate over each
            # other column and determine whether that column is valid.
            # If there is another column that would be a valid key column,
            # shift the columns to the right and put the new key column
            # as the first column. Otherwise clear the table.
            for i in range(1, len(cols)):
                tag = tag_unit_for_column(cols[i])
                if (tag == "text" and 
                    not is_punct_int_col(cols[i]) 
                    and unique_key(cols[i]) 
                    and min_punct_col(cols[i])):
                    # Make a copy of the columns
                    valid_cols = cols[:]
                    # Insert new key column at the beginning
                    valid_cols[0] = cols[i]
                    # Shift key column to the right by one
                    valid_cols[1] = key_col
                    # Remove the other columns
                    valid_cols = valid_cols[:2]
                    # Add the other columns (except for the old key column)
                    # into valid_cols
                    valid_cols.extend(cols[1:i] + cols[i+1:])
                    # Insert these new columns into the memory slot cols
                    cols.clear()
                    cols.extend(valid_cols)
                    return
            cols.clear()

'''
Function that finds out if the column has at least the minimum number of 
entries that don't have punctuation characters (other than ,.-)

Arguments:
    column: Column to be checked

Returns:
    True if the column has the minimum amount of entries without punctuation
    and False otherwise.
'''
def min_punct_col(column):
    count = 0
    valid = False
    restrict_chars = punct_chars.replace("-", '').replace(",", '').replace(".", '').replace(" ", '')
    for i in range(len(column)):
        entry = column[i]
        if not re.search("[" + restrict_chars + "]", entry) :
            count += 1
            if count > 2:
                valid = True
                break
    return valid   

'''
Function that determines whether at least 3 entries in the column are not a
combination of punctuation and integers

Arguments:
    column: Column to be checked

Returns:
    True if the column does not have 3 entries that are not a combination
    of punctuation and integers and False otherwise.
'''
def is_punct_int_col(column):
    is_punct_int_col = True
    count = 0
    for entry in column:
        if not is_punct_int(entry):
            count += 1
            if count > 2:
                is_punct_int_col = False
                break
    return is_punct_int_col

'''
Function that determines whether a string is a combination of punctuation and
integers.

Arguments:
    entry: String to be checked

Returns:
    True if the string is a combination of punctuation and integers and False
    otherwise.
'''
def is_punct_int(entry):
    is_punct_int = True
    punct_int_chars = punct_chars + "0123456789"
    for c in entry:
        if c not in punct_int_chars:
            is_punct_int = False
            break
    return is_punct_int
            
'''
Function that determines if the column has all unique entries (no duplicates)

Arguments:
    col: Column to be checked

Returns:
    True if the column has unique entries and False otherwise.
'''
def unique_key(col):
    key_entries_length = len(col)
    key_set_length = len(set(col))
    if (key_set_length / key_entries_length) == 1:
        return True
    else:
        return False

'''
Function that computes the average of a list of numbers.

Arguments:
    numbers: A list of numbers

Returns:
    The average of the numbers.
'''
def compute_average(numbers):
    return sum(numbers) / len(numbers) 

def tag_columns(columns):
    '''
    Function that tags a set of columns as either "numeric", "text", "date"
    or "None".

    Arguments:
        columns: Columns to be tagged

    Returns: 
        A dictionary where they keys consist of the columns given as an 
        argument and the value is the tag
    '''
    columns_with_tags = {}
    for column in columns:
        unit_tag = tag_unit_for_column(column)
        columns_with_tags[column] = unit_tag
    return columns_with_tags

def tag_unit_for_column(column):
    '''
    Function that tags a particular column as either "numeric", 
    "text", "date" or "None".

    Arguments:
        column: Column to be tagged

    Returns:
        The tag given to this column
    '''
    value_tag_list = []

    # Tag every entry in the column as "numeric", "text", "date" or "None"
    for value in column:
        if value != "":
            value_tag = tag_unit_for_value(value)
            value_tag_list.append(value_tag)

    # Take most common tag or if there were no tags, give the tag "None"
    if len(value_tag_list) > 0:
        finalTag = most_common(value_tag_list)
    else:
        finalTag = "None"
    return finalTag

def tag_unit_for_value(value):
    '''
    Function that tags a particular value as either "numeric", "text",
    "date" or "None"

    Arguments:
        value: Value to be tagged

    Return:
        Returns the tag
    '''
    # Check if the value is date
    word_count = len(
        (value.replace("/"," ").replace("-"," ").replace(".","").replace(",","")).split(" "))

    # Check if the value is numeric
    float_result = is_float(value)
    if float_result:
        return "numeric"

    # If not numeric and not date, then the value is considered text
    return "text"

# https://stackoverflow.com/questions/354038/how-do-i-check-if-a-string-is-a-number-float
# taken on 2018-05-15
def is_float(string):
    '''
    Function that determines whether a given string is of type float.
    '''
    try:
        float(string)
        return True
    except ValueError:
        return False

# https://stackoverflow.com/questions/1518522/find-the-most-common-element-in-a-list
# taken on 2018-05-15
def most_common(L):
    '''
    Function that determines the most common occurence of a number in a list.
    
    Arguments:
        L: List of elements
    
    Returns: 
        Most common element
    '''
    # get an iterable of (item, iterable) pairs
    sl = sorted((x, i) for i, x in enumerate(L))
    # print 'sl:', sl
    groups = itertools.groupby(sl, key=operator.itemgetter(0))
    # auxiliary function to get "quality" for an item
    def _auxfun(g):
        item, iterable = g
        count = 0
        min_index = len(L)
        for _, where in iterable:
            count += 1
            min_index = min(min_index, where)
        # print 'item %r, count %r, minind %r' % (item, count, min_index)
        return count, -min_index
    # pick the highest-count/earliest item
    return max(groups, key=_auxfun)[0]
