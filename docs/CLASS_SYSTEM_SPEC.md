# Class System Specification

## Overview

Restructure Thistle from individual transcript management to class-based transcript organization. Users will manage transcripts grouped by classes, with scheduled meeting times and selective transcription.

## User Flow

### 1. Classes Page (Home)
- Replaces the transcript page as the main view after signup
- Displays grid of class cards organized by semester/year
- Each section (semester/year combo) separated by horizontal rules
- Each card shows:
  - Course code (e.g., "CS 101")
  - Course name (e.g., "Introduction to Computer Science")
  - Professor name
  - Semester and year (e.g., "Fall 2024")
  - Archive indicator (if archived)
- Final card in grid is "Register for Class" with centered plus icon
- Empty state: Only shows register button if user has no classes

### 2. Individual Class Page (`/classes/:id`)
- Lists all recordings and transcripts for the class
- Shows meeting schedule (flexible text, e.g., "Monday Lecture", "Wednesday Lab")
- Displays recordings with statuses:
  - **Pending**: Uploaded but not selected for transcription
  - **Selected**: Marked for transcription by admin
  - **Transcribed**: Processing complete, ready to view
  - **Failed**: Transcription failed
- Upload button to add new recordings
- Each recording tagged with meeting time

### 3. Recording Upload
- Any enrolled student can upload recordings
- Must select which meeting time the recording is for
- Recording enters "pending" state
- Does not auto-transcribe

### 4. Admin Workflow
- Admin views pending recordings
- Selects specific recording to transcribe for each meeting
- Only selected recordings get processed
- Can manage classes (create, archive, enrollments)

## Database Schema

### Classes Table
```sql
CREATE TABLE classes (
  id TEXT PRIMARY KEY,           -- stable random ID (nanoid or similar)
  course_code TEXT NOT NULL,     -- e.g., "CS 101"
  name TEXT NOT NULL,            -- e.g., "Introduction to Computer Science"
  professor TEXT NOT NULL,
  semester TEXT NOT NULL,        -- e.g., "Fall", "Spring", "Summer"
  year INTEGER NOT NULL,         -- e.g., 2024
  archived BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL
);
```

### Class Members Table
```sql
CREATE TABLE class_members (
  class_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  enrolled_at INTEGER NOT NULL,
  PRIMARY KEY (class_id, user_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Meeting Times Table
```sql
CREATE TABLE meeting_times (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  label TEXT NOT NULL,           -- flexible text: "Monday Lecture", "Wednesday Lab", etc.
  created_at INTEGER NOT NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
```

### Updated Transcripts Table
```sql
-- Add new columns to existing transcripts table:
ALTER TABLE transcripts ADD COLUMN class_id TEXT;
ALTER TABLE transcripts ADD COLUMN meeting_time_id TEXT;
ALTER TABLE transcripts ADD COLUMN status TEXT DEFAULT 'pending';
-- status: 'pending' | 'selected' | 'transcribed' | 'failed'

-- Add foreign keys:
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
FOREIGN KEY (meeting_time_id) REFERENCES meeting_times(id) ON DELETE SET NULL
```

**Note**: Add indexes for performance:
- `class_members(user_id)` - lookup user's classes
- `class_members(class_id)` - lookup class members
- `transcripts(class_id)` - lookup class transcripts
- `transcripts(status)` - filter by status
- `meeting_times(class_id)` - lookup class schedule

## Permissions

### Class Access
- Users can only view classes they're enrolled in
- Admins can view all classes
- Non-enrolled users get 403 when accessing `/classes/:id`

### Recording Permissions
- **Upload**: Any enrolled student can upload recordings
- **Delete**: Students can delete their own recordings
- **Select for transcription**: Admin only
- **View**: All enrolled students can view all transcripts in their classes

### Class Management
- **Create**: Admin only (via admin UI)
- **Archive**: Admin only (via admin UI)
- **Enroll students**: Admin only (via admin UI)
- **Remove students**: Admin only (via admin UI)

## Archive Behavior

When a class is archived:
- Students can still view the class and all transcripts
- No new recordings can be uploaded
- No recordings can be deleted
- No transcription selection allowed
- No enrollment changes
- Class appears with archive indicator in UI
- Organized with active classes by semester/year

## API Endpoints

### Classes
- `GET /api/classes` - List user's classes (grouped by semester/year)
- `GET /api/classes/:id` - Get class details (info, meeting times, transcripts)
- `POST /api/classes` (admin) - Create new class
- `PUT /api/classes/:id/archive` (admin) - Archive/unarchive class
- `DELETE /api/classes/:id` (admin) - Delete class

### Class Members
- `POST /api/classes/:id/members` (admin) - Enroll student(s)
- `DELETE /api/classes/:id/members/:userId` (admin) - Remove student
- `GET /api/classes/:id/members` (admin) - List class members

### Meeting Times
- `GET /api/classes/:id/meetings` - List meeting times
- `POST /api/classes/:id/meetings` (admin) - Create meeting time
- `PUT /api/meetings/:id` (admin) - Update meeting time label
- `DELETE /api/meetings/:id` (admin) - Delete meeting time

### Recordings/Transcripts
- `GET /api/classes/:id/transcripts` - List all transcripts for class
- `POST /api/classes/:id/recordings` - Upload recording (enrolled students)
- `PUT /api/transcripts/:id/select` (admin) - Mark recording for transcription
- `DELETE /api/transcripts/:id` - Delete recording (owner or admin)
- `GET /api/transcripts/:id` - View transcript (enrolled students)

## Frontend Components

### Pages
- `/classes` - Classes grid (home page, replaces transcripts page)
- `/classes/:id` - Individual class view
- `/admin` - Update to include class management

### New Components
- `class-card.ts` - Class card component
- `register-card.ts` - Register for class card (plus icon)
- `class-detail.ts` - Individual class page
- `recording-upload.ts` - Recording upload form
- `recording-list.ts` - List of recordings with status
- `admin-classes.ts` - Admin class management interface

### Navigation Updates
- Remove transcript page links
- Add classes link (make it home)
- Update auth redirect after signup to `/classes`

## Migration Strategy

**Breaking change**: Reset database schema to consolidate all migrations.

1. Export any critical production data (if needed)
2. Drop all tables
3. Consolidate migrations in `src/db/schema.ts`:
   - Include all previous migrations
   - Add new class system tables
   - Add new columns to transcripts
4. Restart with version 1
5. Existing transcripts will be lost (acceptable for this phase)

## Admin UI Updates

### Class Management Tab
- Create new class form:
  - Course code
  - Course name
  - Professor
  - Semester dropdown (Fall/Spring/Summer/Winter)
  - Year input
- List all classes (with archive status)
- Archive/unarchive button per class
- Delete class button

### Enrollment Management
- Search for class
- Add student by email
- Remove enrolled students
- View enrollment list per class
- Future: Bulk CSV import

### Recording Selection
- View pending recordings per class
- Select recording to transcribe for each meeting
- View transcription status
- Handle failed transcriptions

## Empty States

- **No classes**: Show only register card with message "No classes yet"
- **No recordings in class**: Show message "No recordings yet" with upload button
- **No pending recordings**: Show message in admin "All recordings processed"

## Future Enhancements (Out of Scope)

- Share/enrollment links for self-enrollment
- Notifications when transcripts ready
- Auto-transcribe settings per class
- Student/instructor roles
- Search/filter classes
- Bulk enrollment via CSV
- Meeting time templates (MWF, TTh patterns)
- Download all transcripts for a class

## Open Questions

None - spec is complete for initial implementation.

## Implementation Phases

### Phase 1: Database & Backend
1. Consolidate migrations and add new schema
2. Add API endpoints for classes and members
3. Update permissions middleware
4. Add admin endpoints

### Phase 2: Admin UI
1. Class management interface
2. Enrollment management
3. Recording selection interface

### Phase 3: Student UI
1. Classes page with cards
2. Individual class pages
3. Recording upload
4. Update navigation

### Phase 4: Testing & Polish
1. Test permissions thoroughly
2. Test archive behavior
3. Empty states
4. Error handling
