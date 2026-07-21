import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}


const normalizeUsername = (value: unknown) => String(value ?? "")
  .trim()
  .replace(/\s+/g, "")
  .toLocaleLowerCase("tr-TR")

const toAuthSafeUsername = (value: unknown) => normalizeUsername(value)
  .replaceAll("ı", "i")
  .replaceAll("ş", "s")
  .replaceAll("ğ", "g")
  .replaceAll("ü", "u")
  .replaceAll("ö", "o")
  .replaceAll("ç", "c")

const isValidUsername = (value: unknown) => /^[a-z0-9._-]{1,30}$/.test(toAuthSafeUsername(value))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

type StudentInput = {
  excel_row?: number
  class_id: string
  class_name?: string
  student_number: number
  first_name: string
  last_name: string
  username: string
  password: string
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ ok: false, error: "Oturum bulunamadı." }, 401)

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) {
      return json({ ok: false, error: "Geçersiz oturum." }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single()

    if (profile?.role !== "teacher") {
      return json({ ok: false, error: "Bu işlem için öğretmen yetkisi gerekir." }, 403)
    }

    const body = await req.json()
    const action = body.action

    const createOneStudent = async (s: StudentInput) => {
      const username = normalizeUsername(s.username)
      const password = String(s.password || "")
      const studentNumber = Number(s.student_number)
      const firstName = String(s.first_name || "").trim()
      const lastName = String(s.last_name || "").trim()

      if (!s.class_id) throw new Error("Sınıf eksik.")
      if (!Number.isInteger(studentNumber) || studentNumber <= 0) throw new Error("Öğrenci numarası geçersiz.")
      if (!firstName || !lastName) throw new Error("Ad ve soyad zorunlu.")
      if (!isValidUsername(username)) {
        throw new Error("Kullanıcı adı 1-30 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir.")
      }
      if (password.length < 6) throw new Error("Şifre en az 6 karakter olmalı.")

      const email = `${username}@taskin.local`

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `${firstName} ${lastName}`.trim() },
      })

      if (createError) {
        if (createError.message.toLowerCase().includes("already")) {
          throw new Error(`Kullanıcı adı zaten kullanılıyor: ${username}`)
        }
        throw createError
      }

      const authUserId = created.user.id

      const { error: studentError } = await admin.from("students").insert({
        auth_user_id: authUserId,
        class_id: s.class_id,
        student_number: studentNumber,
        first_name: firstName,
        last_name: lastName,
        username,
        created_by: userData.user.id,
      })

      if (studentError) {
        await admin.auth.admin.deleteUser(authUserId)
        if (studentError.code === "23505") {
          throw new Error("Aynı sınıfta bu numara veya kullanıcı adı zaten mevcut.")
        }
        throw studentError
      }

      return { auth_user_id: authUserId }
    }

    if (action === "create") {
      await createOneStudent(body.student)
      return json({ ok: true })
    }

    if (action === "bulk_create") {
      const students = Array.isArray(body.students) ? body.students as StudentInput[] : []
      if (!students.length) return json({ ok: false, error: "Aktarılacak öğrenci bulunamadı." }, 400)
      if (students.length > 500) return json({ ok: false, error: "Tek seferde en fazla 500 öğrenci eklenebilir." }, 400)

      const results: Array<Record<string, unknown>> = []
      let successCount = 0
      let failureCount = 0

      for (const student of students) {
        try {
          await createOneStudent(student)
          successCount++
          results.push({
            excel_row: student.excel_row,
            username: student.username,
            ok: true,
          })
        } catch (error) {
          failureCount++
          results.push({
            excel_row: student.excel_row,
            username: student.username,
            ok: false,
            error: error instanceof Error ? error.message : "Bilinmeyen hata.",
          })
        }
      }

      return json({
        ok: true,
        success_count: successCount,
        failure_count: failureCount,
        results,
      })
    }


    if (action === "change_student_username") {
      const studentId = String(body.student_id || "")
      const authUserId = String(body.auth_user_id || "")
      const username = normalizeUsername(body.username)
      if (!studentId || !authUserId) return json({ ok: false, error: "Öğrenci hesabı bağlı değil." }, 400)
      if (!isValidUsername(username)) return json({ ok: false, error: "Kullanıcı adı 1-30 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir." }, 400)

      const { data: existing } = await admin.from("students").select("id").ilike("username", username).neq("id", studentId).maybeSingle()
      if (existing) return json({ ok: false, error: "Bu kullanıcı adı başka bir öğrenci tarafından kullanılıyor." }, 400)

      const email = `${username}@taskin.local`
      const { error: authError } = await admin.auth.admin.updateUserById(authUserId, { email, email_confirm: true })
      if (authError) return json({ ok: false, error: authError.message }, 400)
      const { error: studentError } = await admin.from("students").update({ username }).eq("id", studentId)
      if (studentError) return json({ ok: false, error: studentError.message }, 400)
      return json({ ok: true, username })
    }

    if (action === "change_teacher_credentials") {
      const username = normalizeUsername(body.username)
      const password = body.password ? String(body.password) : ""
      if (!isValidUsername(username)) return json({ ok: false, error: "Kullanıcı adı 1-30 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir." }, 400)
      if (password && password.length < 6) return json({ ok: false, error: "Şifre en az 6 karakter olmalı." }, 400)
      const email = `${username}@taskin.local`
      const attrs: Record<string, unknown> = { email, email_confirm: true }
      if (password) attrs.password = password
      const { error } = await admin.auth.admin.updateUserById(userData.user.id, attrs)
      if (error) return json({ ok: false, error: error.message }, 400)
      return json({ ok: true, username })
    }

    if (action === "change_password") {
      const authUserId = String(body.auth_user_id || "")
      const password = String(body.password || "")

      if (!authUserId) return json({ ok: false, error: "Öğrenci hesabı bağlı değil." }, 400)
      if (password.length < 6) return json({ ok: false, error: "Şifre en az 6 karakter olmalı." }, 400)

      const { error } = await admin.auth.admin.updateUserById(authUserId, { password })
      if (error) return json({ ok: false, error: error.message }, 400)

      return json({ ok: true })
    }

    if (action === "delete") {
      const studentId = String(body.student_id || "")
      const authUserId = body.auth_user_id ? String(body.auth_user_id) : null

      if (studentId) {
        // FK CASCADE mevcut olsa da önce bağlı kayıtları açıkça kaldırarak eski kurulumlarda
        // hayalet LGS sonucu / portal kaydı kalmasını engelle.
        for (const table of ["lgs_results", "lgs_student_portal_settings"]) {
          const { error } = await admin.from(table).delete().eq("student_id", studentId)
          if (error && !String(error.message || "").toLowerCase().includes("does not exist")) {
            return json({ ok: false, error: `${table}: ${error.message}` }, 400)
          }
        }

        const { error } = await admin.from("students").delete().eq("id", studentId)
        if (error) return json({ ok: false, error: error.message }, 400)
      }

      if (authUserId) {
        const { error } = await admin.auth.admin.deleteUser(authUserId)
        if (error) return json({ ok: false, error: error.message }, 400)
      }

      return json({ ok: true })
    }



    if (action === "create_private_student") {
      const student = body.student || {}
      const privateStudentId = String(student.id || "")
      const username = normalizeUsername(student.username)
      const password = String(student.password || "")
      const fullName = String(student.full_name || "").trim()
      if (!privateStudentId || !fullName) return json({ ok:false, error:"Öğrenci bilgileri eksik." },400)
      if (!isValidUsername(username)) return json({ ok:false, error:"Kullanıcı adı geçersiz." },400)
      if (password.length < 6) return json({ ok:false, error:"Şifre en az 6 karakter olmalı." },400)
      const email = `${username}@taskin.local`
      const { data:created, error:createError } = await admin.auth.admin.createUser({
        email, password, email_confirm:true,
        user_metadata:{ full_name:fullName, private_student_id:privateStudentId }
      })
      if (createError) return json({ok:false,error:createError.message},400)
      const { error:profileError } = await admin.from("profiles").upsert({id:created.user.id,full_name:fullName,role:"private_student"},{onConflict:"id"})
      if (profileError) { await admin.auth.admin.deleteUser(created.user.id); return json({ok:false,error:profileError.message},400) }
      return json({ok:true,auth_user_id:created.user.id,username})
    }

    if (action === "update_private_student") {
      const authUserId=String(body.auth_user_id||"")
      const privateStudentId=String(body.student_id||"")
      const username=normalizeUsername(body.username)
      const password=body.password?String(body.password):""
      const fullName=String(body.full_name||"").trim()
      if(!authUserId||!privateStudentId)return json({ok:false,error:"Öğrenci hesabı bağlı değil."},400)
      if(!isValidUsername(username))return json({ok:false,error:"Kullanıcı adı geçersiz."},400)
      if(password&&password.length<6)return json({ok:false,error:"Şifre en az 6 karakter olmalı."},400)
      const attrs:Record<string,unknown>={email:`${username}@taskin.local`,email_confirm:true,user_metadata:{full_name:fullName,private_student_id:privateStudentId}}
      if(password)attrs.password=password
      const {error}=await admin.auth.admin.updateUserById(authUserId,attrs)
      if(error)return json({ok:false,error:error.message},400)
      await admin.from("profiles").upsert({id:authUserId,full_name:fullName,role:"private_student"},{onConflict:"id"})
      return json({ok:true,username})
    }

    if (action === "delete_private_student") {
      const authUserId=String(body.auth_user_id||"")
      if(authUserId){await admin.from("profiles").delete().eq("id",authUserId);const {error}=await admin.auth.admin.deleteUser(authUserId);if(error)return json({ok:false,error:error.message},400)}
      return json({ok:true})
    }

    if (action === "create_lgs_exam") {
      const exam = body.exam
      const name = String(exam?.name || "").trim()
      const examDate = String(exam?.exam_date || "")
      const results = Array.isArray(exam?.results) ? exam.results : []

      if (!name) return json({ ok: false, error: "Deneme adı zorunlu." }, 400)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return json({ ok: false, error: "Deneme tarihi geçersiz." }, 400)
      if (!results.length) return json({ ok: false, error: "Sonuç bulunamadı." }, 400)

      const { data: lgsClass, error: classError } = await admin.from("classes").select("id").eq("is_lgs", true).single()
      if (classError || !lgsClass) return json({ ok: false, error: "LGS Grubu sınıfı bulunamadı." }, 400)

      const studentNumbers = results.map((row: Record<string, unknown>) => Number(row.student_number))
      const { data: students, error: studentsError } = await admin
        .from("students").select("id,student_number,first_name,last_name")
        .eq("class_id", lgsClass.id).eq("is_active", true).in("student_number", studentNumbers)

      if (studentsError) return json({ ok: false, error: studentsError.message }, 400)

      const byNumber = new Map((students || []).map((student) => [Number(student.student_number), student]))
      const missing = results.filter((row: Record<string, unknown>) => !byNumber.has(Number(row.student_number)))
        .map((row: Record<string, unknown>) => Number(row.student_number))

      if (missing.length) return json({ ok: false, error: `LGS Grubu içinde bulunamayan öğrenci numaraları: ${missing.join(", ")}` }, 400)

      const { data: createdExam, error: examError } = await admin.from("lgs_exams")
        .insert({ name, exam_date: examDate, created_by: userData.user.id }).select("id").single()
      if (examError) return json({ ok: false, error: examError.message }, 400)

      try {
        const inserts = results.map((row: Record<string, unknown>) => {
          const number = Number(row.student_number)
          const student = byNumber.get(number)
          if (!student) throw new Error(`Öğrenci bulunamadı: ${number}`)
          return {
            exam_id: createdExam.id, student_id: student.id, student_number: number,
            student_name: String(row.student_name || `${student.first_name} ${student.last_name}`).trim(),
            class_text: row.class_text ? String(row.class_text) : null,
            turkish_correct: Number(row.turkish_correct), turkish_net: Number(row.turkish_net),
            history_correct: Number(row.history_correct), history_net: Number(row.history_net),
            religion_correct: Number(row.religion_correct), religion_net: Number(row.religion_net),
            english_correct: Number(row.english_correct), english_net: Number(row.english_net),
            math_correct: Number(row.math_correct), math_net: Number(row.math_net),
            science_correct: Number(row.science_correct), science_net: Number(row.science_net),
            total_correct: Number(row.total_correct), total_net: Number(row.total_net),
            score: Number(row.score), rank: Number(row.rank)
          }
        })

        const { error: resultError } = await admin.from("lgs_results").insert(inserts)
        if (resultError) throw resultError
        return json({ ok: true, success_count: inserts.length, exam_id: createdExam.id })
      } catch (error) {
        await admin.from("lgs_exams").delete().eq("id", createdExam.id)
        return json({ ok: false, error: error instanceof Error ? error.message : "Sonuçlar kaydedilemedi." }, 400)
      }
    }

    if (action === "delete_lgs_exam") {
      const examId = String(body.exam_id || "")
      if (!examId) return json({ ok: false, error: "Deneme kimliği eksik." }, 400)
      const { error } = await admin.from("lgs_exams").delete().eq("id", examId)
      if (error) return json({ ok: false, error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ ok: false, error: "Geçersiz işlem." }, 400)
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Bilinmeyen hata.",
    }, 500)
  }
})
